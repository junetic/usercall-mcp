import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { createUsercallServer } from "./server.js";
import {
  TRIGGER_TOOL_CATALOG,
  TRIGGER_TOOL_INPUT_SCHEMAS,
  buildTriggerToolRequest,
  createFetchTriggerApiCaller,
  registerTriggerTools,
  toToolResult,
  type TriggerApiCaller,
} from "./triggers.js";

const TRIGGER_ID = "11111111-1111-4111-8111-111111111111";

interface ManifestTool {
  name: string;
  annotations: Record<string, boolean>;
  input_keys: string[];
  required: string[];
}

const manifest = JSON.parse(
  readFileSync(new URL("../fixtures/tool-manifest.json", import.meta.url), "utf8"),
) as { tools: ManifestTool[] };

async function connect(callApi: TriggerApiCaller) {
  const server = new McpServer({ name: "test", version: "0.0.0" });
  registerTriggerTools(server, callApi);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

test("trigger tools match the hosted MCP manifest (names, annotations, inputs)", () => {
  for (const tool of TRIGGER_TOOL_CATALOG) {
    const hosted = manifest.tools.find((entry) => entry.name === tool.name);
    assert.ok(hosted, `${tool.name} missing from fixtures/tool-manifest.json`);

    const shape = TRIGGER_TOOL_INPUT_SCHEMAS[tool.name].shape as Record<
      string,
      { isOptional(): boolean }
    >;
    assert.deepEqual(Object.keys(shape).sort(), hosted.input_keys, tool.name);
    assert.deepEqual(
      Object.keys(shape)
        .filter((key) => !shape[key]!.isOptional())
        .sort(),
      hosted.required,
      tool.name,
    );
    assert.deepEqual(tool.annotations, hosted.annotations, tool.name);
  }

  const hostedTriggerTools = manifest.tools
    .map((tool) => tool.name)
    .filter((name) => name.includes("trigger") || name === "list_studies");
  assert.deepEqual(
    TRIGGER_TOOL_CATALOG.map((tool) => tool.name).sort(),
    hostedTriggerTools.sort(),
  );
});

test("create/update descriptions state that only humans can activate", () => {
  for (const name of ["create_research_trigger", "update_research_trigger"]) {
    const tool = TRIGGER_TOOL_CATALOG.find((entry) => entry.name === name);
    assert.match(
      tool?.description ?? "",
      /Only a human can activate them via the returned activation_url/,
    );
  }
});

test("tool requests map to the Agent API", () => {
  assert.deepEqual(
    buildTriggerToolRequest("get_trigger_sdk_setup", {
      provider: "mixpanel",
      events: ["study_tested"],
    }),
    { method: "GET", path: "/api/v1/agent/triggers/setup?provider=mixpanel&events=study_tested" },
  );
  assert.deepEqual(
    buildTriggerToolRequest("update_research_trigger", {
      trigger_id: TRIGGER_ID,
      sampling_percent: 25,
    }),
    {
      method: "PATCH",
      path: `/api/v1/agent/triggers/${TRIGGER_ID}`,
      body: { sampling_percent: 25 },
    },
  );
  assert.equal(
    buildTriggerToolRequest("get_trigger_event_schema", { event_name: "$pageview" }).path,
    "/api/v1/agent/triggers/events/%24pageview/schema",
  );
  assert.equal(
    buildTriggerToolRequest("delete_research_trigger", { trigger_id: TRIGGER_ID }).method,
    "DELETE",
  );
});

test("fetch caller sends the bearer key and never throws on API errors", async () => {
  let seen: { url: string; method?: string; auth: string | null; body?: string } | undefined;
  const caller = createFetchTriggerApiCaller({
    baseUrl: "https://app.usercall.test/",
    apiKey: "key_123",
    fetchImpl: async (input, init) => {
      seen = {
        url: String(input),
        method: init?.method,
        auth: new Headers(init?.headers).get("authorization"),
        body: init?.body as string | undefined,
      };
      return new Response(JSON.stringify({ error: "invalid_trigger" }), { status: 422 });
    },
  });

  const response = await caller({ method: "POST", path: "/api/v1/agent/triggers", body: { a: 1 } });
  assert.equal(response.status, 422);
  assert.equal(seen?.url, "https://app.usercall.test/api/v1/agent/triggers");
  assert.equal(seen?.auth, "Bearer key_123");
  assert.equal(seen?.body, JSON.stringify({ a: 1 }));
});

test("unknown conditions are forwarded to the API and its error reaches the agent", async () => {
  let forwarded: unknown;
  const client = await connect(async (request) => {
    forwarded = request.body;
    return {
      status: 422,
      data: {
        error: "invalid_trigger",
        message: "Unsupported trigger condition: count.",
        suggestions: [],
      },
    };
  });

  const result = (await client.callTool({
    name: "create_research_trigger",
    arguments: { study_id: TRIGGER_ID, event_name: "study_created", count: 3 },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.deepEqual(forwarded, { study_id: TRIGGER_ID, event_name: "study_created", count: 3 });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /Unsupported trigger condition: count/);
});

test("activation attempts return the 409 activation_url", async () => {
  const client = await connect(async () => ({
    status: 409,
    data: {
      error: "activation_required",
      activation_url: `https://app.usercall.co/home/triggers/${TRIGGER_ID}/activate`,
    },
  }));

  const result = (await client.callTool({
    name: "update_research_trigger",
    arguments: { trigger_id: TRIGGER_ID, status: "active" },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /activation_url/);
});

test("tools/list exposes all ten trigger tools", async () => {
  const client = await connect(async () => ({ status: 200, data: {} }));
  const { tools } = await client.listTools();
  assert.equal(tools.length, 10);
});

test("create forwards status=active so the API (not this layer) rejects it", async () => {
  let forwarded: unknown;
  const client = await connect(async (request) => {
    forwarded = request.body;
    return {
      status: 422,
      data: { error: "invalid_trigger", message: "Unsupported trigger condition: status." },
    };
  });

  const result = (await client.callTool({
    name: "create_research_trigger",
    arguments: { study_id: TRIGGER_ID, event_name: "study_tested", status: "active" },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.deepEqual(forwarded, {
    study_id: TRIGGER_ID,
    event_name: "study_tested",
    status: "active",
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0]?.text ?? "", /Unsupported trigger condition: status/);
});

test("fixed-path tools map to the Agent API", () => {
  assert.deepEqual(buildTriggerToolRequest("get_trigger_capabilities", {}), {
    method: "GET",
    path: "/api/v1/agent/triggers/capabilities",
  });
  assert.deepEqual(buildTriggerToolRequest("list_trigger_events", {}), {
    method: "GET",
    path: "/api/v1/agent/triggers/events",
  });
  assert.deepEqual(buildTriggerToolRequest("list_studies", {}), {
    method: "GET",
    path: "/api/v1/agent/studies",
  });
  assert.deepEqual(buildTriggerToolRequest("list_research_triggers", {}), {
    method: "GET",
    path: "/api/v1/agent/triggers",
  });
  assert.deepEqual(buildTriggerToolRequest("get_research_trigger", { trigger_id: TRIGGER_ID }), {
    method: "GET",
    path: `/api/v1/agent/triggers/${TRIGGER_ID}`,
  });
  const body = { study_id: TRIGGER_ID, event_name: "study_tested", traits: { plan: "free" } };
  assert.deepEqual(buildTriggerToolRequest("create_research_trigger", body), {
    method: "POST",
    path: "/api/v1/agent/triggers",
    body,
  });
});

test("http_status from the transport cannot be overwritten by the API body", () => {
  const result = toToolResult({ status: 422, data: { http_status: 200, error: "x" } });
  assert.equal(JSON.parse(result.content[0]?.text ?? "{}").http_status, 422);
  assert.equal(result.isError, true);
});

test("the stdio server registers every study and trigger tool", async () => {
  const server = createUsercallServer({
    apiKey: "key_123",
    baseUrl: "https://app.usercall.test",
    fetchImpl: async () => new Response("{}"),
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    manifest.tools.map((tool) => tool.name).sort(),
  );
});

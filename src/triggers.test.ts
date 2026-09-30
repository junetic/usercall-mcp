import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  STUDY_TOOL_CATALOG,
  STUDY_TOOL_INPUT_SCHEMAS,
  createUsercallServer,
} from "./server.js";
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

test("create/update descriptions state that a person must open activation_url", () => {
  const create = TRIGGER_TOOL_CATALOG.find((entry) => entry.name === "create_research_trigger");
  const update = TRIGGER_TOOL_CATALOG.find((entry) => entry.name === "update_research_trigger");
  assert.match(create?.description ?? "", /You cannot turn it on/);
  assert.match(create?.description ?? "", /activation_url/);
  assert.match(update?.description ?? "", /Agents cannot set it active/);
  assert.match(update?.description ?? "", /activation_url/);
});

test("study tools match the hosted MCP manifest (names, annotations, inputs)", () => {
  for (const tool of STUDY_TOOL_CATALOG) {
    const hosted = manifest.tools.find((entry) => entry.name === tool.name);
    assert.ok(hosted, `${tool.name} missing from fixtures/tool-manifest.json`);

    const shape = STUDY_TOOL_INPUT_SCHEMAS[tool.name].shape as Record<
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

  const hostedStudyTools = manifest.tools
    .map((tool) => tool.name)
    .filter((name) => !name.includes("trigger") && name !== "list_studies");
  assert.deepEqual(
    STUDY_TOOL_CATALOG.map((tool) => tool.name).sort(),
    hostedStudyTools.sort(),
  );
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

test("delivery fields are forwarded on create and update; webhook_secret: null is allowed", async () => {
  const bodies: unknown[] = [];
  const client = await connect(async (request) => {
    bodies.push(request.body);
    return { status: 200, data: {} };
  });

  const created = (await client.callTool({
    name: "create_research_trigger",
    arguments: {
      study_id: TRIGGER_ID,
      event_name: "study_tested",
      delivery_method: "webhook",
      webhook_url: "https://hooks.example.com/usercall",
      webhook_secret: "whsec_0123456789abcdef",
    },
  })) as { isError?: boolean };
  assert.equal(created.isError, false);

  const updated = (await client.callTool({
    name: "update_research_trigger",
    arguments: { trigger_id: TRIGGER_ID, webhook_secret: null },
  })) as { isError?: boolean };
  assert.equal(updated.isError, false);

  const toIntercept = (await client.callTool({
    name: "update_research_trigger",
    arguments: { trigger_id: TRIGGER_ID, delivery_method: "intercept" },
  })) as { isError?: boolean };
  assert.equal(toIntercept.isError, false);

  assert.deepEqual(bodies, [
    {
      study_id: TRIGGER_ID,
      event_name: "study_tested",
      delivery_method: "webhook",
      webhook_url: "https://hooks.example.com/usercall",
      webhook_secret: "whsec_0123456789abcdef",
    },
    { webhook_secret: null },
    { delivery_method: "intercept" },
  ]);
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

const STUDY_ID = "22222222-2222-4222-8222-222222222222";
const SIMULATION_ID = "33333333-3333-4333-8333-333333333333";

async function connectStudyServer(
  fetchImpl: typeof fetch,
) {
  const server = createUsercallServer({
    apiKey: "key_123",
    baseUrl: "https://app.usercall.test/",
    fetchImpl,
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
}

test("the stdio server registers every study and trigger tool", async () => {
  assert.equal(manifest.tools.length, 17);
  const client = await connectStudyServer(async () => new Response("{}"));

  const { tools } = await client.listTools();
  assert.equal(tools.length, 17);
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    manifest.tools.map((tool) => tool.name).sort(),
  );

  for (const expected of [...STUDY_TOOL_CATALOG, ...TRIGGER_TOOL_CATALOG]) {
    const tool = tools.find((entry) => entry.name === expected.name);
    assert.equal(tool?.description, expected.description, expected.name);
  }
});

test("key_research_goal alone still creates a study", async () => {
  let seen: { url: string; method?: string; body?: string } | undefined;
  const client = await connectStudyServer(async (input, init) => {
    seen = {
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
    };
    return new Response(JSON.stringify({ study_id: STUDY_ID, interview_link: "https://call.example" }), {
      status: 201,
    });
  });

  const goal = "Why do invited teammates stop before they send the invite?";
  const result = (await client.callTool({
    name: "create_study",
    arguments: { key_research_goal: goal },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.equal(result.isError, undefined);
  assert.equal(seen?.method, "POST");
  assert.equal(seen?.url, "https://app.usercall.test/api/v1/agent/studies");
  assert.deepEqual(JSON.parse(seen?.body ?? "{}"), { key_research_goal: goal });
});

test("simulate_interview starts with POST and reads with GET without polling", async () => {
  const calls: Array<{ url: string; method?: string; body?: string }> = [];
  const client = await connectStudyServer(async (input, init) => {
    calls.push({
      url: String(input),
      method: init?.method,
      body: typeof init?.body === "string" ? init.body : undefined,
    });
    return new Response(
      JSON.stringify({ status: "running", simulation_id: SIMULATION_ID }),
      { status: 200 },
    );
  });

  const started = (await client.callTool({
    name: "simulate_interview",
    arguments: { study_id: STUDY_ID },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(
    calls[0]?.url,
    `https://app.usercall.test/api/v1/agent/studies/${STUDY_ID}/simulations`,
  );
  assert.equal(calls[0]?.body, "{}");
  assert.equal(started.isError, undefined);
  assert.match(started.content[0]?.text ?? "", /"status":"running"/);

  const persona = { name: "Alex", prompt: "A new teammate who has not sent an invite." };
  await client.callTool({
    name: "simulate_interview",
    arguments: { study_id: STUDY_ID, persona },
  });
  assert.equal(calls[1]?.body, JSON.stringify({ persona }));

  await client.callTool({
    name: "simulate_interview",
    arguments: { study_id: STUDY_ID, simulation_id: SIMULATION_ID, persona },
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[2]?.method, "GET");
  assert.equal(
    calls[2]?.url,
    `https://app.usercall.test/api/v1/agent/studies/${STUDY_ID}/simulations/${SIMULATION_ID}`,
  );
  assert.equal(calls[2]?.body, undefined);
});

test("simulate_interview and review_study pass API errors through", async () => {
  let reviewBody: string | undefined;
  const client = await connectStudyServer(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/reviews")) {
      reviewBody = typeof init?.body === "string" ? init.body : undefined;
      return new Response(
        JSON.stringify({
          message: "Insufficient credits",
          checkout_url: "https://app.usercall.co/checkout",
        }),
        { status: 402 },
      );
    }
    return new Response(JSON.stringify({ message: "Daily simulation cap reached" }), {
      status: 429,
    });
  });

  const capped = (await client.callTool({
    name: "simulate_interview",
    arguments: { study_id: STUDY_ID },
  })) as { isError?: boolean; content: Array<{ text: string }> };
  assert.equal(capped.isError, true);
  const capPayload = JSON.parse(capped.content[0]?.text ?? "{}") as {
    http_status?: number;
    message?: string;
  };
  assert.equal(capPayload.http_status, 429);
  assert.match(capPayload.message ?? "", /Daily simulation cap reached/);

  const reviewed = (await client.callTool({
    name: "review_study",
    arguments: { study_id: STUDY_ID },
  })) as { isError?: boolean; content: Array<{ text: string }> };
  assert.equal(reviewBody, "{}");
  assert.equal(reviewed.isError, true);
  const reviewPayload = JSON.parse(reviewed.content[0]?.text ?? "{}") as {
    http_status?: number;
    checkout_url?: string;
  };
  assert.equal(reviewPayload.http_status, 402);
  assert.equal(reviewPayload.checkout_url, "https://app.usercall.co/checkout");
});

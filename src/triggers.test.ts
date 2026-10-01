import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  PACKAGE_VERSION,
  SERVER_INSTRUCTIONS,
  SERVER_INSTRUCTIONS_LEAD,
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
  assert.match(create?.description ?? "", /cannot activate/);
  assert.match(create?.description ?? "", /activation_url/);
  assert.match(update?.description ?? "", /status active is rejected/);
  assert.match(update?.description ?? "", /409/);
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

  const instructions = client.getInstructions();
  assert.equal(instructions, SERVER_INSTRUCTIONS);
  assert.ok(SERVER_INSTRUCTIONS_LEAD.length >= 400);
  assert.ok(SERVER_INSTRUCTIONS_LEAD.length <= 512);
  assert.equal(instructions?.slice(0, SERVER_INSTRUCTIONS_LEAD.length), SERVER_INSTRUCTIONS_LEAD);
  const toolSearchWindow = instructions?.slice(0, 512) ?? "";
  assert.equal(toolSearchWindow.startsWith(SERVER_INSTRUCTIONS_LEAD), true);
  assert.match(toolSearchWindow.slice(SERVER_INSTRUCTIONS_LEAD.length), /^\s*$/);
  for (const fact of [
    "voice",
    "text",
    "churn",
    "onboarding",
    "quotes",
    "activation_url",
    "checkout_url",
    "409",
    "summary",
    "agent study",
    "interview_link",
  ]) {
    assert.match(SERVER_INSTRUCTIONS_LEAD, new RegExp(fact));
  }

  const { tools } = await client.listTools();
  assert.equal(tools.length, 17);
  assert.deepEqual(
    tools.map((tool) => tool.name).sort(),
    manifest.tools.map((tool) => tool.name).sort(),
  );

  for (const expected of [...STUDY_TOOL_CATALOG, ...TRIGGER_TOOL_CATALOG]) {
    const tool = tools.find((entry) => entry.name === expected.name);
    assert.equal(tool?.description, expected.description, expected.name);
    assert.equal(tool?.title, expected.title, expected.name);
    assert.equal(tool?.annotations?.readOnlyHint, expected.annotations.readOnlyHint, expected.name);
    assert.equal(
      tool?.annotations?.destructiveHint,
      expected.annotations.destructiveHint,
      expected.name,
    );
    assert.equal(tool?.annotations?.openWorldHint, false, expected.name);
  }
});

function collectSchemaDescriptions(value: unknown, found: string[]) {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaDescriptions(item, found);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.description === "string") found.push(record.description);
  for (const nested of Object.values(record)) collectSchemaDescriptions(nested, found);
}

/** Cross-tool orchestration and direct commands to the model. Job language is allowed. */
const ORCHESTRATION_PATTERNS = [
  /\bcall\s+(?:this|that|again|next|first|instead)\b/i,
  /\b(?:then|next)\s+call\b/i,
  /\b(?:do not|don't)\b/i,
  /\bnever\s+(?:call|set|share|treat|invent|poll|try|activate|send)\b/i,
  /\b(?:you must|you should)\b/i,
  /\bagents?\s+(?:cannot|must|should|can|do)\b/i,
  /\bprefer\s+(?:format|to\s+call)\b/i,
  /\bhand\s+\S+\s+to\b/i,
  /\bsurface\s+\S+\s+to\b/i,
];

function orchestrationHits(snippet: string, toolNames: string[]) {
  const hits: string[] = [];
  for (const pattern of ORCHESTRATION_PATTERNS) {
    const match = snippet.match(pattern);
    if (match?.[0]) hits.push(match[0]);
  }
  for (const name of toolNames) {
    if (new RegExp(`\\b${name}\\b`).test(snippet)) hits.push(name);
  }
  return hits;
}

test("MCP copy describes each tool without model-behavior or cross-tool instructions", async () => {
  const toolNames = [...STUDY_TOOL_CATALOG, ...TRIGGER_TOOL_CATALOG].map((tool) => tool.name);
  for (const allowed of [
    "callback",
    "Usercall interviews real users",
    "a phone call with a participant",
    "call_ids are not accepted",
    "Write-only: never returned.",
    "One active agent study per account.",
    "Does not invite a participant.",
    "x-usercall-signature",
    "Use this to learn why users churn",
    "Use this when you need themes, insights, and quotes",
    "onboarding drop-off and failed actions",
    "themes, insights, and verbatim quotes",
    "users who prefer voice",
  ]) {
    assert.deepEqual(orchestrationHits(allowed, toolNames), [], allowed);
  }
  for (const blocked of [
    "Call list_studies first",
    "then call update_study",
    "use this when you need why, then call get_study_results",
    "Do not share the link yet",
    "Never set status to active",
    "Prefer format=summary",
    "Agents cannot activate",
    "see get_trigger_event_schema",
    "call again with that id",
  ]) {
    assert.ok(orchestrationHits(blocked, toolNames).length > 0, blocked);
  }

  const client = await connectStudyServer(async () => new Response("{}"));
  const { tools } = await client.listTools();
  const snippets = [client.getInstructions() ?? ""];
  for (const tool of tools) {
    snippets.push(tool.title ?? "", tool.description ?? "");
    collectSchemaDescriptions(tool.inputSchema, snippets);
  }

  const hidden = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/;
  for (const snippet of snippets) {
    assert.equal(hidden.test(snippet), false, snippet);
    assert.deepEqual(orchestrationHits(snippet, toolNames), [], snippet);
  }
});

test("the interview skill keeps create, simulate, then review", () => {
  const skill = readFileSync(
    new URL("../skills/run-user-interviews/SKILL.md", import.meta.url),
    "utf8",
  );
  const createAt = skill.indexOf("`create_study`");
  const simulateAt = skill.indexOf("`simulate_interview`");
  const reviewAt = skill.indexOf("`review_study`");
  assert.ok(createAt >= 0 && simulateAt > createAt && reviewAt > simulateAt);
});

test("fixtures/tools-list.json matches initialize instructions and listTools", async () => {
  const dump = JSON.parse(
    readFileSync(new URL("../fixtures/tools-list.json", import.meta.url), "utf8"),
  ) as {
    version: string;
    instructions: string;
    tools: Array<{
      name: string;
      title?: string;
      description?: string;
      annotations?: {
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        openWorldHint?: boolean;
      };
    }>;
  };
  const client = await connectStudyServer(async () => new Response("{}"));
  const { tools } = await client.listTools();

  assert.equal(dump.version, PACKAGE_VERSION);
  assert.equal(dump.instructions, client.getInstructions());
  assert.deepEqual(
    dump.tools.map((tool) => tool.name),
    tools.map((tool) => tool.name),
  );
  for (const dumped of dump.tools) {
    const tool = tools.find((entry) => entry.name === dumped.name);
    assert.equal(dumped.title, tool?.title, dumped.name);
    assert.equal(dumped.description, tool?.description, dumped.name);
    assert.equal(dumped.annotations?.readOnlyHint, tool?.annotations?.readOnlyHint, dumped.name);
    assert.equal(
      dumped.annotations?.destructiveHint,
      tool?.annotations?.destructiveHint,
      dumped.name,
    );
    assert.equal(dumped.annotations?.openWorldHint, tool?.annotations?.openWorldHint, dumped.name);
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
  const note = JSON.parse(result.content[0]?.text ?? "{}")._note as string;
  assert.match(note, /Study created with 1 interview slot/);
  assert.deepEqual(
    orchestrationHits(note, ["simulate_interview", "review_study", "update_study", "list_studies"]),
    [],
  );
});

test("create_study rejects a question band longer than duration_minutes", async () => {
  let body: unknown;
  const client = await connectStudyServer(async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({ study_id: STUDY_ID, interview_link: "https://call.example" }),
      { status: 201 },
    );
  });

  const goal = "Why do invited teammates stop before they send the invite?";
  const rejected = (await client.callTool({
    name: "create_study",
    arguments: {
      key_research_goal: goal,
      duration_minutes: 12,
      target_question_count: 18,
      max_questions_for_duration: 20,
    },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.equal(rejected.isError, true);
  assert.equal(body, undefined);
  const rejectedBody = JSON.parse(rejected.content[0]?.text ?? "{}") as { message?: string };
  assert.match(rejectedBody.message ?? "", /at most 5 questions/);
  assert.match(rejectedBody.message ?? "", /Bands that fit: 2-5/);

  const accepted = (await client.callTool({
    name: "create_study",
    arguments: {
      key_research_goal: goal,
      duration_minutes: 45,
      target_question_count: 18,
      max_questions_for_duration: 20,
    },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.equal(accepted.isError, undefined);
  assert.deepEqual(body, {
    key_research_goal: goal,
    duration_minutes: 45,
    target_question_count: 18,
    max_questions_for_duration: 20,
  });
});

test("update_study forwards workflow question objects", async () => {
  let body: unknown;
  const client = await connectStudyServer(async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ study_id: STUDY_ID }), { status: 200 });
  });

  const questions = [{ text: "What stopped you before sending the invite?" }];
  const updated = (await client.callTool({
    name: "update_study",
    arguments: { study_id: STUDY_ID, workflow_questions: questions },
  })) as { isError?: boolean };

  assert.notEqual(updated.isError, true);
  assert.deepEqual(body, { workflow_questions: questions });

  let called = false;
  const rejecting = await connectStudyServer(async () => {
    called = true;
    return new Response("{}", { status: 200 });
  });
  const rejected = (await rejecting.callTool({
    name: "update_study",
    arguments: { study_id: STUDY_ID, workflow_questions: ["What stopped you?"] },
  })) as { isError?: boolean };

  assert.equal(rejected.isError, true);
  assert.equal(called, false);
});

const HOSTED_WORKFLOW_QUESTION_KEYS = [
  "closedEndedType",
  "customTransitionCondition",
  "followUpCount",
  "followUpPrompt",
  "id",
  "instructionType",
  "isAdaptive",
  "isClosedEnded",
  "mediaDescription",
  "mediaImage",
  "mediaType",
  "mediaUploadedFile",
  "mediaUrl",
  "order",
  "text",
];

function workflowQuestionShape() {
  let current = STUDY_TOOL_INPUT_SCHEMAS.update_study.shape.workflow_questions as {
    shape?: Record<string, { isOptional(): boolean }>;
    _def: { typeName?: string; innerType?: unknown; type?: unknown; schema?: unknown };
  };
  for (let i = 0; i < 8; i += 1) {
    const typeName = current._def.typeName;
    if (typeName === "ZodOptional" || typeName === "ZodNullable" || typeName === "ZodDefault") {
      current = current._def.innerType as typeof current;
      continue;
    }
    if (typeName === "ZodArray") {
      current = current._def.type as typeof current;
      continue;
    }
    if (typeName === "ZodEffects") {
      current = current._def.schema as typeof current;
      continue;
    }
    break;
  }
  return current.shape ?? {};
}

test("workflow question fields match the hosted schema and unknown keys are stripped", async () => {
  const shape = workflowQuestionShape();
  assert.deepEqual(Object.keys(shape).sort(), HOSTED_WORKFLOW_QUESTION_KEYS);
  assert.deepEqual(
    Object.keys(shape).filter((key) => !shape[key]!.isOptional()),
    ["text"],
  );

  let body: unknown;
  const client = await connectStudyServer(async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ study_id: STUDY_ID }), { status: 200 });
  });
  const forwarded = (await client.callTool({
    name: "update_study",
    arguments: {
      study_id: STUDY_ID,
      workflow_questions: [
        { text: "What stopped you?", extraField: "drop me", followUpCount: 1 },
      ],
    },
  })) as { isError?: boolean };
  assert.notEqual(forwarded.isError, true);
  assert.deepEqual(body, {
    workflow_questions: [{ text: "What stopped you?", followUpCount: 1 }],
  });

  let called = false;
  const rejecting = await connectStudyServer(async () => {
    called = true;
    return new Response("{}", { status: 200 });
  });
  const rejected = (await rejecting.callTool({
    name: "update_study",
    arguments: {
      study_id: STUDY_ID,
      workflow_questions: [{ text: "What stopped you?", followUpCount: 3 }],
    },
  })) as { isError?: boolean };
  assert.equal(rejected.isError, true);
  assert.equal(called, false);
});

test("update_study passes API errors through", async () => {
  const client = await connectStudyServer(async () =>
    new Response(
      JSON.stringify({
        message: "Invalid guide",
        suggestions: ["Shorten question 2"],
      }),
      { status: 422 },
    ),
  );
  const result = (await client.callTool({
    name: "update_study",
    arguments: { study_id: STUDY_ID, key_learning_goals: "Why they stopped" },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.equal(result.isError, true);
  const payload = JSON.parse(result.content[0]?.text ?? "{}") as {
    http_status?: number;
    message?: string;
    suggestions?: string[];
  };
  assert.equal(payload.http_status, 422);
  assert.equal(payload.message, "Invalid guide");
  assert.deepEqual(payload.suggestions, ["Shorten question 2"]);
});

test("get_study_results returns the API payload without a quotes note", async () => {
  const client = await connectStudyServer(async () =>
    new Response(JSON.stringify({ themes: [] }), { status: 200 }),
  );
  const result = (await client.callTool({
    name: "get_study_results",
    arguments: { study_id: STUDY_ID },
  })) as { isError?: boolean; content: Array<{ text: string }> };

  assert.notEqual(result.isError, true);
  assert.deepEqual(JSON.parse(result.content[0]?.text ?? "{}"), { themes: [] });
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

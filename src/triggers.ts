import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Research Trigger tools. Names, annotations and input keys must match the
// hosted MCP (see fixtures/tool-manifest.json and src/triggers.test.ts).

export type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface TriggerApiResponse {
  status: number;
  data: unknown;
}

export type TriggerApiCaller = (request: {
  method: HttpMethod;
  path: string;
  body?: unknown;
}) => Promise<TriggerApiResponse>;

export const SETUP_PROVIDERS = [
  "posthog",
  "mixpanel",
  "amplitude",
  "segment",
  "ga4",
  "custom",
] as const;

const filterValue = z.union([z.string(), z.number(), z.boolean()]);
const filterMap = z.record(z.string().min(1).max(120), filterValue);
const urlRule = z
  .object({
    match: z.enum(["equals", "contains", "starts_with"]),
    value: z.string().min(1).max(500),
  })
  .strict()
  .describe("Page URL rule. Matches the page path, query or hash.");
const sourceKind = z
  .enum(["page_visit", "analytics_event", "custom"])
  .describe(
    'Trigger source. Use "page_visit" with event_name "$pageview" for URL/dwell page-visit triggers.',
  );

const targetingShape = {
  event_name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("An event returned by list_trigger_events."),
  properties: filterMap
    .optional()
    .describe(
      "Exact-match filters on event properties (see get_trigger_event_schema).",
    ),
  traits: filterMap
    .optional()
    .describe(
      "Exact-match filters on user traits (see get_trigger_event_schema).",
    ),
  url: urlRule.optional(),
  dwell_seconds: z
    .number()
    .int()
    .min(1)
    .max(600)
    .optional()
    .describe(
      "Page-visit triggers only: fire once the visitor has stayed this many seconds on a matching page.",
    ),
  source: sourceKind.optional(),
};

const configShape = {
  name: z.string().trim().min(1).max(100).optional(),
  sampling_percent: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Percent of matching users to invite (default 100)."),
  cooldown_days: z
    .number()
    .int()
    .min(0)
    .max(365)
    .optional()
    .describe("Days before the same user can be invited again (default 30)."),
  max_invites_per_day: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Daily invitation cap for this trigger (default 100)."),
  intercept_title: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .optional()
    .describe(
      'Small label above the prompt, e.g. "AI-guided · 2-3 minutes".',
    ),
  intercept_body: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .optional()
    .describe("Prompt text shown to the user."),
  delivery_method: z
    .enum(["intercept", "webhook"])
    .optional()
    .describe(
      'intercept (default): in-app voice/text widget via the Usercall SDK. webhook: POST each matched user to webhook_url.',
    ),
  webhook_url: z
    .string()
    .trim()
    .url()
    .max(500)
    .optional()
    .describe(
      'Public https endpoint for delivery_method webhook. Receives user ID, email, traits, event properties and a personal interview link. To remove a webhook, set delivery_method "intercept" (clears webhook_url and webhook_secret).',
    ),
  webhook_secret: z
    .string()
    .min(16)
    .max(200)
    .optional()
    .describe(
      "Optional HMAC secret; requests carry x-usercall-signature. Write-only: never returned.",
    ),
  invite_link_params: z
    .object({
      static: z.record(z.string(), z.string()).optional(),
      from_traits: z.record(z.string(), z.string()).optional(),
      from_properties: z.record(z.string(), z.string()).optional(),
    })
    .optional()
    .describe(
      "Query params copied onto interview links when the study has link context enabled.",
    ),
};

const triggerIdShape = { trigger_id: z.string().uuid() };

// Create/update pass unknown keys through so the Usercall API rejects them
// with an explanation instead of this layer silently dropping them.
export const TRIGGER_TOOL_INPUT_SCHEMAS = {
  get_trigger_capabilities: z.object({}),
  get_trigger_sdk_setup: z.object({
    provider: z
      .enum(SETUP_PROVIDERS)
      .optional()
      .describe("Analytics provider the SDK should listen to (default posthog)."),
    events: z
      .array(z.string().trim().min(1).max(120))
      .max(50)
      .optional()
      .describe("Event names to allowlist in the snippet."),
  }),
  list_trigger_events: z.object({}),
  get_trigger_event_schema: z.object({
    event_name: z.string().trim().min(1).max(120),
  }),
  list_studies: z.object({}),
  create_research_trigger: z
    .object({
      study_id: z
        .string()
        .uuid()
        .describe("Study from list_studies or create_study."),
      ...targetingShape,
      ...configShape,
    })
    .passthrough(),
  list_research_triggers: z.object({}),
  get_research_trigger: z.object(triggerIdShape),
  update_research_trigger: z
    .object({
      ...triggerIdShape,
      ...targetingShape,
      ...configShape,
      event_name: targetingShape.event_name.optional(),
      properties: filterMap.nullable().optional(),
      traits: filterMap.nullable().optional(),
      url: urlRule.nullable().optional(),
      dwell_seconds: z.number().int().min(1).max(600).nullable().optional(),
      source: sourceKind.nullable().optional(),
      webhook_secret: configShape.webhook_secret
        .unwrap()
        .nullable()
        .optional()
        .describe(
          "Optional HMAC secret; requests carry x-usercall-signature. Write-only: never returned. null removes it.",
        ),
      status: z
        .enum(["active", "paused"])
        .optional()
        .describe(
          'Use "paused" to pause. "active" is rejected: only a human can activate via activation_url.',
        ),
    })
    .passthrough(),
  delete_research_trigger: z.object(triggerIdShape),
} satisfies Record<string, z.AnyZodObject>;

export type TriggerToolName = keyof typeof TRIGGER_TOOL_INPUT_SCHEMAS;

interface TriggerToolMeta {
  name: TriggerToolName;
  title: string;
  description: string;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    openWorldHint: boolean;
  };
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};
const write = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
};

export const TRIGGER_TOOL_CATALOG: TriggerToolMeta[] = [
  {
    name: "get_trigger_capabilities",
    title: "Get Trigger Capabilities",
    description:
      "Call before you design a trigger. Returns what Research Triggers support (one event plus exact-match property or trait filters, URL, page dwell, sampling, cooldown, daily cap) and what they do not (counts, sequences, absence, time windows, not-equals). Stop and send `interview_link` when the condition you need is unsupported.",
    annotations: readOnly,
  },
  {
    name: "get_trigger_sdk_setup",
    title: "Get Trigger SDK Setup",
    description:
      "Call when `list_trigger_events` is empty and the product event must reach UserCall before `create_research_trigger`. Returns the SDK install snippet, an identify snippet, and install status. Never includes secret keys. If you can edit the codebase, apply the snippet; otherwise show it to a person. Then call `list_trigger_events` again. Stop and send `interview_link` if nobody can install the SDK.",
    annotations: write,
  },
  {
    name: "list_trigger_events",
    title: "List Trigger Events",
    description:
      "Call before `create_research_trigger`. Returns event names UserCall has received for this account in the last 30 days. Only an observed event can be used. If the list is empty, call `get_trigger_sdk_setup`. If your event is missing, stop and send `interview_link` instead.",
    annotations: readOnly,
  },
  {
    name: "get_trigger_event_schema",
    title: "Get Trigger Event Schema",
    description:
      "Call after `list_trigger_events` shows the event and you need a filter. Returns observed properties and traits with types and sample values. Put filters under the right key. Matching is case- and type-sensitive. Stop if the value you need was never observed; do not invent a filter.",
    annotations: readOnly,
  },
  // list_studies is registered with the trigger tools, matching the hosted catalog.
  {
    name: "list_studies",
    title: "List Studies",
    description:
      "Call before `create_study`. Reuse an existing study when one already asks this question. Call `create_study` when it does not. Each row includes the same `interview_link` create returns. Stop once you have picked that study or confirmed none exists.",
    annotations: readOnly,
  },
  {
    name: "create_research_trigger",
    title: "Create Research Trigger",
    description:
      "Call only after a study exists and `list_trigger_events` has seen the event. It invites those people when that event occurs so you can ask why. Created paused. A person opens `activation_url`. You cannot turn it on. Use the shareable `interview_link` when the event is not in UserCall yet. Stop after you hand `activation_url` to a person. Unsupported conditions (counts, sequences, absence, time windows, not-equals) are rejected.",
    annotations: write,
  },
  {
    name: "list_research_triggers",
    title: "List Research Triggers",
    description:
      "Call when you may already have a trigger for this study and event. Returns status and `activation_url`. Reuse a paused trigger and hand `activation_url` to a person. Call `create_research_trigger` only when none matches. Stop once you have that link or have confirmed you need a new trigger.",
    annotations: readOnly,
  },
  {
    name: "get_research_trigger",
    title: "Get Research Trigger",
    description:
      "Call when you have `trigger_id` and need status or `activation_url` while the trigger is paused. Hand `activation_url` to a person. Agents cannot activate. Stop polling this for interview evidence; call `get_study_status`.",
    annotations: readOnly,
  },
  {
    name: "update_research_trigger",
    title: "Update Research Trigger",
    description:
      "Call to change targeting, sampling, cooldown, daily cap, intercept copy, or delivery, or to pause a trigger. Agents cannot set it active. Changing an active trigger pauses it for re-approval. A person opens `activation_url`. Stop after you hand that link to a person.",
    annotations: write,
  },
  {
    name: "delete_research_trigger",
    title: "Delete Research Trigger",
    description:
      "Call when the event or the study is wrong. Permanently deletes the trigger. Interviews already completed are kept. Stop. To pause without deleting, call `update_research_trigger` with status paused.",
    annotations: { ...write, destructiveHint: true },
  },
];

/** Maps validated tool args to the Usercall Agent API request. */
export function buildTriggerToolRequest(
  name: TriggerToolName,
  args: Record<string, unknown>,
): { method: HttpMethod; path: string; body?: unknown } {
  const base = "/api/v1/agent/triggers";
  const id = () => encodeURIComponent(String(args.trigger_id));

  switch (name) {
    case "get_trigger_capabilities":
      return { method: "GET", path: `${base}/capabilities` };
    case "get_trigger_sdk_setup": {
      const params = new URLSearchParams();
      if (typeof args.provider === "string") params.set("provider", args.provider);
      if (Array.isArray(args.events) && args.events.length) {
        params.set("events", args.events.join(","));
      }
      const query = params.toString();
      return { method: "GET", path: `${base}/setup${query ? `?${query}` : ""}` };
    }
    case "list_trigger_events":
      return { method: "GET", path: `${base}/events` };
    case "get_trigger_event_schema":
      return {
        method: "GET",
        path: `${base}/events/${encodeURIComponent(String(args.event_name))}/schema`,
      };
    case "list_studies":
      return { method: "GET", path: "/api/v1/agent/studies" };
    case "create_research_trigger":
      return { method: "POST", path: base, body: args };
    case "list_research_triggers":
      return { method: "GET", path: base };
    case "get_research_trigger":
      return { method: "GET", path: `${base}/${id()}` };
    case "update_research_trigger": {
      const { trigger_id: _triggerId, ...body } = args;
      return { method: "PATCH", path: `${base}/${id()}`, body };
    }
    case "delete_research_trigger":
      return { method: "DELETE", path: `${base}/${id()}` };
  }
}

/** API errors (message, suggestions, warnings, activation_url) reach the agent verbatim. */
export function toToolResult(response: TriggerApiResponse) {
  const payload =
    response.data && typeof response.data === "object" && !Array.isArray(response.data)
      ? { ...(response.data as Record<string, unknown>), http_status: response.status }
      : { http_status: response.status, data: response.data };

  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError: response.status >= 400,
  };
}

export function registerTriggerTools(server: McpServer, callApi: TriggerApiCaller) {
  for (const meta of TRIGGER_TOOL_CATALOG) {
    server.registerTool(
      meta.name,
      {
        title: meta.title,
        description: meta.description,
        inputSchema: TRIGGER_TOOL_INPUT_SCHEMAS[meta.name],
        annotations: meta.annotations,
      },
      async (args: Record<string, unknown>) =>
        toToolResult(await callApi(buildTriggerToolRequest(meta.name, args))),
    );
  }
}

/** fetch-based caller that never throws on HTTP errors. */
export function createFetchTriggerApiCaller(options: {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}): TriggerApiCaller {
  const fetchImpl = options.fetchImpl ?? fetch;

  return async ({ method, path, body }) => {
    const response = await fetchImpl(
      `${options.baseUrl.replace(/\/+$/, "")}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
    );

    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }
    }

    return { status: response.status, data };
  };
}

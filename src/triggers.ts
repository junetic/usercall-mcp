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
    'Trigger source. page_visit pairs with event_name "$pageview" for URL or dwell triggers.',
  );

const targetingShape = {
  event_name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe(
      "Observed product event from the last 30 days, such as a failed action or onboarding step.",
    ),
  properties: filterMap
    .optional()
    .describe(
      "Exact-match filters on observed event properties. Matching is case-sensitive and type-sensitive.",
    ),
  traits: filterMap
    .optional()
    .describe(
      "Exact-match filters on observed user traits. Matching is case-sensitive and type-sensitive.",
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
      "Optional HMAC secret. Requests carry x-usercall-signature. Write-only: never returned.",
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
      .describe("Analytics provider the SDK listens to (default posthog)."),
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
        .describe("UUID of the interview study this trigger invites people into."),
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
          "Optional HMAC secret. Requests carry x-usercall-signature. Write-only: never returned. null removes it.",
        ),
      status: z
        .enum(["active", "paused"])
        .optional()
        .describe(
          'Trigger status. "paused" pauses the trigger. "active" is rejected with HTTP 409 and activation_url; a person opens that URL to activate.',
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
    title: "See research trigger limits",
    description:
      "See which in-product research trigger conditions this account can use. Returns supported and unsupported kinds. Supported: one product event, an exact property or trait match, a URL rule, and page dwell. Unsupported: counts, sequences, absence, time windows, and not-equals. Does not create a trigger.",
    annotations: readOnly,
  },
  {
    name: "get_trigger_sdk_setup",
    title: "Get the interview SDK snippet",
    description:
      "Get the snippet that sends product events, such as a failed action, onboarding step, or churn signal, into Usercall for in-product interviews. Returns install_snippet, identify_snippet, allowlist_update_snippet, and install status. provider defaults to posthog. events names the allowlist. The response does not include secret keys. Does not create a trigger.",
    annotations: readOnly,
  },
  {
    name: "list_trigger_events",
    title: "List product events",
    description:
      "List product event names Usercall has received in the last 30 days, such as a failed action or onboarding step. Returns those names. A research trigger accepts only an observed event name. An empty list means no events have arrived. Does not create a trigger.",
    annotations: readOnly,
  },
  {
    name: "get_trigger_event_schema",
    title: "Read event fields",
    description:
      "Read the fields observed on one product event so a trigger can match a property or user trait. Returns each field's type and sample values. Filters are exact matches and are case-sensitive and type-sensitive. Values that were not observed are absent. Does not create a trigger.",
    annotations: readOnly,
  },
  // list_studies is registered with the trigger tools, matching the hosted catalog.
  {
    name: "list_studies",
    title: "List interview studies",
    description:
      "List interview studies on this account so an existing question about churn, onboarding, or a failed action can be reused. Returns study_id, interview_link, interview_mode, and trigger_eligible. trigger_eligible is false when the study has no interview link. Does not create or edit a study.",
    annotations: readOnly,
  },
  {
    name: "create_research_trigger",
    title: "Create an in-product interview trigger",
    description:
      "Create a paused in-product research trigger that invites a user to an interview right after a product moment, such as a failed action, churn event, or onboarding step. Returns activation_url. Created paused; a person opens activation_url to activate. delivery_method defaults to intercept (in-app prompt). webhook posts each match to webhook_url. Unsupported filters are rejected. This tool cannot activate the trigger or send the invite.",
    annotations: write,
  },
  {
    name: "list_research_triggers",
    title: "List research triggers",
    description:
      "List in-product research triggers that invite users to an interview after a product event. Returns status and activation_url for each. activation_url is present while a trigger is paused and empty after a person activates it. Does not change a trigger and cannot activate one.",
    annotations: readOnly,
  },
  {
    name: "get_research_trigger",
    title: "Get a research trigger",
    description:
      "Read one in-product research trigger by trigger_id, including who it invites and how many interviews it has started. Returns status, targeting, activation_url, and invite and interview counts. activation_url is present while the trigger is paused. Does not change the trigger, cannot activate it, and does not return themes or quotes.",
    annotations: readOnly,
  },
  {
    name: "update_research_trigger",
    title: "Update a research trigger",
    description:
      "Update who an in-product interview trigger invites: product event, trait or property match, sampling, cooldown, daily cap, prompt copy, or delivery. Returns the updated trigger. status paused pauses it. status active is rejected with HTTP 409 and activation_url; a person opens that URL to activate. Editing an active trigger pauses it until a person approves it again. Does not activate a trigger.",
    annotations: write,
  },
  {
    name: "delete_research_trigger",
    title: "Delete a research trigger",
    description:
      "Permanently delete an in-product research trigger. Interviews already completed stay on the study, including their themes and quotes. Cannot be undone. Does not delete the interview study. A paused trigger stops new invites and keeps the trigger.",
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

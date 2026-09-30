import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createFetchTriggerApiCaller, registerTriggerTools } from "./triggers.js";

export const PACKAGE_VERSION = "0.3.0";

export interface UsercallServerConfig {
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

const studyMediaSchema = z
  .object({
    type: z
      .enum(["image", "prototype"])
      .describe(
        "Media type: 'image' for direct image URLs (.png, .jpg, .gif, .webp) or 'prototype' for Figma prototype URLs",
      ),
    url: z
      .string()
      .url()
      .describe("Public URL to the image or Figma prototype"),
    description: z
      .string()
      .max(500)
      .optional()
      .describe("Alt text / context shown to participants"),
  })
  .describe(
    "Visual stimulus shown during all interview questions (web participants only)",
  );

const languagesSchema = z.array(z.string().trim().min(1)).min(1).optional();
const voiceGenderSchema = z.enum(["female", "male"]).optional();
const customLinkVariablesSchema = z
  .array(
    z.object({
      key: z
        .string()
        .trim()
        .regex(/^[a-z][a-z0-9_]{0,31}$/),
      label: z.string().trim().max(60).optional(),
      default_value: z.string().trim().max(200).optional(),
    }),
  )
  .max(10)
  .optional();

const createStudySchema = z.object({
  key_research_goal: z
    .string()
    .min(5)
    .max(2000)
    .describe("Research goal for the study. Cannot be changed later."),
  business_context: z.string().min(5).max(2000).optional(),
  additional_context_prompt: z.string().optional(),
  target_interviews: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Interview slots to create. Defaults to 1 if omitted."),
  languages: languagesSchema,
  duration_minutes: z
    .number()
    .int()
    .min(5)
    .max(65)
    .optional()
    .describe("Interview length in minutes. Defaults to 12."),
  interview_mode: z
    .enum(["voice", "text", "voice_and_text"])
    .optional()
    .describe("How participants take the interview. Defaults to voice."),
  voice_gender: voiceGenderSchema,
  enable_link_context: z.boolean().optional(),
  custom_link_variables: customLinkVariablesSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  study_media: studyMediaSchema.optional(),
});

const workflowQuestionSchema = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    text: z.string().trim().min(1).max(2000),
    followUpCount: z.number().int().min(-1).max(5).optional(),
    followUpPrompt: z.string().trim().max(2000).optional(),
    instructionType: z.enum(["prompt", "static_text"]).optional(),
    customTransitionCondition: z.string().trim().max(2000).optional(),
    isAdaptive: z.boolean().optional(),
    isClosedEnded: z.boolean().optional(),
    closedEndedType: z.enum(["numeric", "categorical", "yes_no"]).optional(),
    order: z.number().int().min(0).optional(),
    mediaType: z.enum(["none", "image", "video", "prototype"]).optional(),
    mediaUrl: z.string().trim().max(4000).optional(),
    mediaUploadedFile: z.string().trim().max(4000).optional(),
    mediaDescription: z.string().trim().max(4000).optional(),
    mediaImage: z.string().trim().max(4000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.isClosedEnded) {
      if (value.isAdaptive) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["isAdaptive"],
          message: "Closed-ended questions cannot use adaptive follow-ups.",
        });
      }
      if (value.followUpCount !== undefined && value.followUpCount !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["followUpCount"],
          message: "Closed-ended questions must have no follow-ups.",
        });
      }
    }

    if (value.isAdaptive && value.followUpCount === -1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isAdaptive"],
        message: "Adaptive probing cannot be combined with a custom transition condition.",
      });
    }

    if (
      value.isAdaptive &&
      value.followUpCount !== undefined &&
      value.followUpCount !== 3
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["followUpCount"],
        message: "Adaptive questions must have followUpCount set to 3 (adaptive cap).",
      });
    }

    if (value.followUpCount === 3 && value.isAdaptive !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["isAdaptive"],
        message:
          "followUpCount=3 is reserved for adaptive questions. Set isAdaptive=true or pick a different follow-up count.",
      });
    }
  });

const updateStudySchema = z.object({
  study_id: z.string().uuid(),
  target_interviews: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .describe("Total number of interview slots for this study."),
  is_link_disabled: z.boolean().optional(),
  ai_agent_intro_message: z
    .string()
    .optional()
    .describe("Opening message the interviewer says to participants."),
  key_learning_goals: z
    .string()
    .optional()
    .describe("Learning goals that guide the interviewer."),
  workflow_end_message: z
    .string()
    .optional()
    .describe("Closing message shown when the interview ends."),
  workflow_questions: z
    .array(workflowQuestionSchema)
    .min(1)
    .max(200)
    .optional()
    .describe("Interview questions. Each item requires text."),
  interview_mode: z
    .enum(["voice", "text", "voice_and_text"])
    .optional()
    .describe("How participants take the interview."),
  languages: languagesSchema,
  voice_gender: voiceGenderSchema,
  enable_link_context: z.boolean().optional(),
  custom_link_variables: customLinkVariablesSchema,
  study_media: studyMediaSchema
    .nullable()
    .optional()
    .describe(
      "Visual stimulus shown during all interview questions (web participants only). Pass null to clear.",
    ),
});

const studyIdSchema = z.object({
  study_id: z.string().uuid(),
});

const getStudyResultsSchema = studyIdSchema.extend({
  format: z.enum(["summary", "full"]).optional(),
});

const simulateInterviewSchema = studyIdSchema.extend({
  simulation_id: z.string().uuid().optional(),
  persona: z
    .object({
      name: z.string().trim().min(1).max(80),
      prompt: z.string().trim().min(1).max(4000),
    })
    .optional(),
});

export interface StudyToolAnnotations {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  openWorldHint: boolean;
}

export const STUDY_TOOL_INPUT_SCHEMAS = {
  create_study: createStudySchema,
  update_study: updateStudySchema,
  get_study_status: studyIdSchema,
  get_study_results: getStudyResultsSchema,
  simulate_interview: simulateInterviewSchema,
  review_study: studyIdSchema,
  delete_study: studyIdSchema,
} satisfies Record<string, z.ZodObject<z.ZodRawShape>>;

export interface StudyToolCatalogEntry {
  name: keyof typeof STUDY_TOOL_INPUT_SCHEMAS;
  title: string;
  description: string;
  annotations: StudyToolAnnotations;
}

export const STUDY_TOOL_CATALOG: StudyToolCatalogEntry[] = [
  {
    name: "create_study",
    title: "Create Study",
    description:
      "Interview affected users when analytics already shows a signal (funnel drop-off, churn, stalled activation, or an AI-feature failure) and still cannot say why. A PostHog team-invite drop, Amplitude export retention, a Pendo billing-guide dismissal, or AI summary regenerations are this job. `key_research_goal` is that question. `business_context` is optional: the product, the metric, the window, the counts, and who to interview. `key_research_goal` alone still creates a study. Returns `study_id` and `interview_link`. One active agent study per account. Short credits return `checkout_url` for a person to open. Skip this when the chart already names a tracking gap or a missing control. Call `list_studies` first and reuse a study that already asks this question.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "update_study",
    title: "Update Study",
    description:
      "Call after `review_study` or a failed simulation names a guide change, or when the link is disabled and you are about to share. Writes target interviews, interview mode, languages, voice gender, link context, guide text, or media. One locale turns the language picker off; two or more turn it on. Query params on `interview_link` are ignored until `enable_link_context` is true. You cannot change `key_research_goal`; delete the study and call `create_study`. Stop when the update returns. Then simulate or review again before sharing.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_study_status",
    title: "Get Study Status",
    description:
      "Poll until `complete` after interviews are in progress. `running` and `analyzing` mean wait and call this again. Do not treat those payloads as a finding. Then call `get_study_results`. The response includes `interview_link` and `next_step`. `simulate_interview` means dry-run or review the guide before anyone is invited. `share` means send `interview_link`, or call `create_research_trigger` only after `list_trigger_events` has seen the event.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_study_results",
    title: "Get Study Results",
    description:
      "Call after `get_study_status` is `complete`. Default `format=summary` returns themes, insights, and risks. `format=summary` is the concise response and `format=full` is the detailed one; stay on summary. Use `format=full` only for a quote. Summary is the evidence to place beside the original metric. Stop when that summary answers why. Empty themes while the study is still running are not a finding.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "simulate_interview",
    title: "Simulate Interview",
    description:
      "Call before any real participant, after create or a guide edit. Omit `simulation_id` to start. The start returns immediately with `running` and `simulation_id`; stop there and call again with that id. A later read returns `pass`, `fail`, or `error` and the transcript when the run is finished. Cap is 5 simulations per account per UTC day; a 429 means stop for the day. A simulation is not an interview and does not change `completed_interviews`. On `pass`, share or review. On `fail`, call `update_study`, then simulate again.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "review_study",
    title: "Review Study",
    description:
      "Call before sharing when you want a check of the interview guide. It reads the guide only. It does not read transcripts and it does not apply edits. It costs 1 credit and works when the in-app study review control is hidden. Short credits return `checkout_url` for a person to open. Write suggested changes with `update_study`. Stop after one review unless the guide changed.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "delete_study",
    title: "Delete Study",
    description:
      "Call when this study asks the wrong question or you must free the one active agent study. Permanently deletes the study and its interview calls and releases unused reserved credits. Stop. This cannot be undone. To stop new interviews without deleting evidence, call `update_study` with `is_link_disabled` true.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
  },
];

class UsercallApiError extends Error {
  readonly status: number;
  readonly checkoutUrl?: string;
  readonly payload: unknown;

  constructor(
    status: number,
    message: string,
    payload: unknown,
    checkoutUrl?: string,
  ) {
    super(message);
    this.name = "UsercallApiError";
    this.status = status;
    this.payload = payload;
    this.checkoutUrl = checkoutUrl;
  }
}

function endpoint(config: UsercallServerConfig, path: string) {
  return `${config.baseUrl.replace(/\/+$/, "")}${path}`;
}

async function requestUsercallApi(
  config: UsercallServerConfig,
  path: string,
  init?: RequestInit,
) {
  const response = await (config.fetchImpl ?? fetch)(endpoint(config, path), {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();

  if (!response.ok) {
    let message = `Usercall API error (${response.status})`;
    let payload: unknown = text;
    let checkoutUrl: string | undefined;

    try {
      const parsed = JSON.parse(text);
      payload = parsed;
      if (typeof parsed?.message === "string") message = parsed.message;
      if (typeof parsed?.checkout_url === "string") {
        checkoutUrl = parsed.checkout_url;
      }
    } catch {}

    if (response.status === 402) {
      throw new UsercallApiError(
        402,
        checkoutUrl
          ? `${message} Add credits via checkout_url.`
          : `${message} Add credits at https://app.usercall.co.`,
        payload,
        checkoutUrl,
      );
    }

    throw new UsercallApiError(response.status, message, payload, checkoutUrl);
  }

  return text.length ? JSON.parse(text) : {};
}

function result(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

function errorResult(error: unknown) {
  if (error instanceof UsercallApiError && error.status === 402) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "insufficient_credits",
            status: 402,
            message: error.message,
            checkout_url: error.checkoutUrl,
          }),
        },
      ],
    };
  }

  throw error;
}

function toolResultFromApiError(error: UsercallApiError) {
  const data = error.payload;
  const payload: Record<string, unknown> =
    data && typeof data === "object" && !Array.isArray(data)
      ? { ...(data as Record<string, unknown>), http_status: error.status }
      : { http_status: error.status, message: error.message, data };

  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

function appendNote(payload: unknown, note: string) {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...(payload as Record<string, unknown>),
      _note: note,
    };
  }

  return {
    payload,
    _note: note,
  };
}

/** Builds the MCP server with all study and Research Trigger tools (no transport). */
export function createUsercallServer(config: UsercallServerConfig) {
  const callUsercallApi = (path: string, init?: RequestInit) =>
    requestUsercallApi(config, path, init);

  const server = new McpServer({
    name: "usercall-mcp",
    version: PACKAGE_VERSION,
  });

  const createMeta = STUDY_TOOL_CATALOG.find((tool) => tool.name === "create_study")!;
  server.tool(
    createMeta.name,
    createMeta.description,
    STUDY_TOOL_INPUT_SCHEMAS.create_study.shape,
    {
      title: createMeta.title,
      ...createMeta.annotations,
    },
    async (input) => {
      try {
        const payload = await callUsercallApi("/api/v1/agent/studies", {
          method: "POST",
          body: JSON.stringify(input),
        });

        const slots = input.target_interviews ?? 1;
        const mediaNote = input.study_media
          ? " Media is visible to web participants only."
          : "";
        const note = `Study created with ${slots} interview slot(s).${mediaNote} Call simulate_interview before any real participant. On pass, share interview_link or call review_study. On fail, call update_study, then simulate again.`;

        return result(appendNote(payload, note));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  const updateMeta = STUDY_TOOL_CATALOG.find((tool) => tool.name === "update_study")!;
  server.tool(
    updateMeta.name,
    updateMeta.description,
    STUDY_TOOL_INPUT_SCHEMAS.update_study.shape,
    {
      title: updateMeta.title,
      ...updateMeta.annotations,
    },
    async (input) => {
      try {
        const { study_id, ...body } = input;
        const payload = await callUsercallApi(
          `/api/v1/agent/studies/${study_id}`,
          {
            method: "PATCH",
            body: JSON.stringify(body),
          },
        );
        return result(payload);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  const statusMeta = STUDY_TOOL_CATALOG.find(
    (tool) => tool.name === "get_study_status",
  )!;
  server.tool(
    statusMeta.name,
    statusMeta.description,
    STUDY_TOOL_INPUT_SCHEMAS.get_study_status.shape,
    {
      title: statusMeta.title,
      ...statusMeta.annotations,
    },
    async (input) => {
      const payload = await callUsercallApi(
        `/api/v1/agent/studies/${input.study_id}`,
      );
      return result(payload);
    },
  );

  const resultsMeta = STUDY_TOOL_CATALOG.find(
    (tool) => tool.name === "get_study_results",
  )!;
  server.tool(
    resultsMeta.name,
    resultsMeta.description,
    STUDY_TOOL_INPUT_SCHEMAS.get_study_results.shape,
    {
      title: resultsMeta.title,
      ...resultsMeta.annotations,
    },
    async (input) => {
      const format = input.format ?? "summary";
      const payload = await callUsercallApi(
        `/api/v1/agent/studies/${input.study_id}/results?format=${format}`,
      );
      return result(
        appendNote(
          payload,
          "When presenting these results, include verbatim participant quotes from each theme's quotes array. Do not paraphrase — show the actual words.",
        ),
      );
    },
  );

  const simulateMeta = STUDY_TOOL_CATALOG.find(
    (tool) => tool.name === "simulate_interview",
  )!;
  server.tool(
    simulateMeta.name,
    simulateMeta.description,
    STUDY_TOOL_INPUT_SCHEMAS.simulate_interview.shape,
    {
      title: simulateMeta.title,
      ...simulateMeta.annotations,
    },
    async (input) => {
      try {
        const { study_id, simulation_id, persona } = input;
        const payload = simulation_id
          ? await callUsercallApi(
              `/api/v1/agent/studies/${study_id}/simulations/${simulation_id}`,
              { method: "GET" },
            )
          : await callUsercallApi(
              `/api/v1/agent/studies/${study_id}/simulations`,
              {
                method: "POST",
                body: JSON.stringify(persona ? { persona } : {}),
              },
            );
        return result(payload);
      } catch (error) {
        if (error instanceof UsercallApiError) return toolResultFromApiError(error);
        throw error;
      }
    },
  );

  const reviewMeta = STUDY_TOOL_CATALOG.find((tool) => tool.name === "review_study")!;
  server.tool(
    reviewMeta.name,
    reviewMeta.description,
    STUDY_TOOL_INPUT_SCHEMAS.review_study.shape,
    {
      title: reviewMeta.title,
      ...reviewMeta.annotations,
    },
    async (input) => {
      try {
        const payload = await callUsercallApi(
          `/api/v1/agent/studies/${input.study_id}/reviews`,
          { method: "POST", body: JSON.stringify({}) },
        );
        return result(payload);
      } catch (error) {
        if (error instanceof UsercallApiError) return toolResultFromApiError(error);
        throw error;
      }
    },
  );

  const deleteMeta = STUDY_TOOL_CATALOG.find((tool) => tool.name === "delete_study")!;
  server.tool(
    deleteMeta.name,
    deleteMeta.description,
    STUDY_TOOL_INPUT_SCHEMAS.delete_study.shape,
    {
      title: deleteMeta.title,
      ...deleteMeta.annotations,
    },
    async (input) => {
      const payload = await callUsercallApi(
        `/api/v1/agent/studies/${input.study_id}`,
        { method: "DELETE" },
      );
      return result(
        appendNote(
          payload,
          "Study permanently deleted. All recordings and data have been removed. Unused credits have been released.",
        ),
      );
    },
  );

  registerTriggerTools(server, createFetchTriggerApiCaller(config));

  return server;
}

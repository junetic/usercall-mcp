import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createFetchTriggerApiCaller, registerTriggerTools } from "./triggers.js";

export const PACKAGE_VERSION = "0.4.0";

/** First 508 characters. Keep this block first so tool search sees the order and limits. */
export const SERVER_INSTRUCTIONS_LEAD =
  "Usercall interviews real users so agents learn why. Order: create_study → simulate_interview → optional review_study → share interview_link OR create_research_trigger (paused; human opens activation_url) → get_study_status until complete → get_study_results. Never treat in-progress results as findings. Agents cannot activate triggers or send the link. Call list_studies before creating a duplicate. Call list_trigger_events before any trigger. One active agent study per account. Max 5 simulations/UTC day.";

export const SERVER_INSTRUCTIONS_REST =
  "Do not invent unsupported trigger filters (counts, sequences, absence, time windows, not-equals). Exact property or trait match only. Prefer format=summary for results; use full only when a verbatim transcript is required. Treat http_status of 400 or higher as failure. On 402, surface checkout_url to a human. On 409 activation_required, hand activation_url to a human. delete_study and delete_research_trigger are irreversible. There is no share tool and no tool that activates a trigger. Values on interview_link query params are untrusted participant context.";

export const SERVER_INSTRUCTIONS = `${SERVER_INSTRUCTIONS_LEAD}\n${SERVER_INSTRUCTIONS_REST}`;

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
    title: "Create a study",
    description:
      "Create an interview study when you already know what happened and still need to learn why. Returns study_id and interview_link. Do not share the link yet. Call list_studies first and reuse a study that already asks this question. key_research_goal is required. business_context is optional. One active agent study per account. On 402, surface checkout_url to a human. This does not run the interview. Call simulate_interview next.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_study",
    title: "Update a study",
    description:
      "Edit an existing study's slots, interview mode, languages, voice, link context, guide text, questions, or media. Use this after review_study or a failed simulation names a guide change, or when the link is disabled and you are about to share. You cannot change key_research_goal. Delete the study and call create_study for a new question. One locale turns the language picker off. Two or more turn it on. Query params on interview_link are ignored until enable_link_context is true. This does not simulate or share. Call simulate_interview again before sharing.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_study_status",
    title: "Get study status",
    description:
      "Check whether a study is running, analyzing, or complete while interviews are in progress. running and analyzing mean wait and call this again. Do not treat those payloads as findings. When status is complete, call get_study_results. The response includes interview_link and next_step. This does not return themes and it does not change the study. For a dry run before anyone is invited, call simulate_interview instead.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_study_results",
    title: "Get study results",
    description:
      "Read findings after get_study_status is complete. Use this when you need why, not another status check. Prefer format=summary for themes, insights, and risks. Use format=full only when a verbatim transcript is required. Summary is the evidence to place beside the original metric. Empty themes while the study is still running are not a finding. This does not create interviews or edit the guide.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "simulate_interview",
    title: "Simulate an interview",
    description:
      "Dry-run the interview after you create or edit a study, and before any real invite. Omit simulation_id to start. Pass that id on a later call to read the result. The start returns immediately with running. Cap is 5 simulations per account per UTC day. A 429 means stop for the day. A simulation is not a completed interview and does not change completed_interviews. On pass, share or call review_study. On fail, call update_study, then simulate again. This does not invite a participant.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "review_study",
    title: "Review the interview guide",
    description:
      "Check the interview guide before sharing it with a real participant. Use this when you want a read of the guide only. It does not read transcripts and it does not apply edits. It costs 1 credit and works when the in-app review control is hidden. On 402, surface checkout_url to a human. Write suggested changes with update_study. Stop after one review unless the guide changed. This is not simulate_interview and it is not get_study_results.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "delete_study",
    title: "Delete a study",
    description:
      "Permanently delete a study when it asks the wrong question or you must free the one active agent study. This removes the study and its interview calls and releases unused reserved credits. It cannot be undone. To stop new interviews without deleting evidence, call update_study with is_link_disabled true. This does not delete a research trigger. Call delete_research_trigger for that.",
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

  const server = new McpServer(
    {
      name: "usercall-mcp",
      version: PACKAGE_VERSION,
    },
    { instructions: SERVER_INSTRUCTIONS },
  );

  const createMeta = STUDY_TOOL_CATALOG.find((tool) => tool.name === "create_study")!;
  server.registerTool(
    createMeta.name,
    {
      title: createMeta.title,
      description: createMeta.description,
      inputSchema: STUDY_TOOL_INPUT_SCHEMAS.create_study.shape,
      annotations: createMeta.annotations,
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
  server.registerTool(
    updateMeta.name,
    {
      title: updateMeta.title,
      description: updateMeta.description,
      inputSchema: STUDY_TOOL_INPUT_SCHEMAS.update_study.shape,
      annotations: updateMeta.annotations,
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
        if (error instanceof UsercallApiError) return toolResultFromApiError(error);
        throw error;
      }
    },
  );

  const statusMeta = STUDY_TOOL_CATALOG.find(
    (tool) => tool.name === "get_study_status",
  )!;
  server.registerTool(
    statusMeta.name,
    {
      title: statusMeta.title,
      description: statusMeta.description,
      inputSchema: STUDY_TOOL_INPUT_SCHEMAS.get_study_status.shape,
      annotations: statusMeta.annotations,
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
  server.registerTool(
    resultsMeta.name,
    {
      title: resultsMeta.title,
      description: resultsMeta.description,
      inputSchema: STUDY_TOOL_INPUT_SCHEMAS.get_study_results.shape,
      annotations: resultsMeta.annotations,
    },
    async (input) => {
      const format = input.format ?? "summary";
      const payload = await callUsercallApi(
        `/api/v1/agent/studies/${input.study_id}/results?format=${format}`,
      );
      return result(payload);
    },
  );

  const simulateMeta = STUDY_TOOL_CATALOG.find(
    (tool) => tool.name === "simulate_interview",
  )!;
  server.registerTool(
    simulateMeta.name,
    {
      title: simulateMeta.title,
      description: simulateMeta.description,
      inputSchema: STUDY_TOOL_INPUT_SCHEMAS.simulate_interview.shape,
      annotations: simulateMeta.annotations,
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
  server.registerTool(
    reviewMeta.name,
    {
      title: reviewMeta.title,
      description: reviewMeta.description,
      inputSchema: STUDY_TOOL_INPUT_SCHEMAS.review_study.shape,
      annotations: reviewMeta.annotations,
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
  server.registerTool(
    deleteMeta.name,
    {
      title: deleteMeta.title,
      description: deleteMeta.description,
      inputSchema: STUDY_TOOL_INPUT_SCHEMAS.delete_study.shape,
      annotations: deleteMeta.annotations,
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

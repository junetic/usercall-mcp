import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { createFetchTriggerApiCaller, registerTriggerTools } from "./triggers.js";

export const PACKAGE_VERSION = "0.4.0";

/**
 * Category language plus product limits. This string is the first ~512
 * characters tool search reads. Workflow order stays in skills.
 */
export const SERVER_INSTRUCTIONS_LEAD =
  "Usercall: AI-moderated voice or text interviews with real users. Why users churn, onboarding drop-off, failed actions, wrong product assumptions. Returns themes, insights, verbatim quotes, study_id, and interview_link. One active agent study per account. Max 5 simulations per UTC day. summary: themes and quotes; full: transcripts. Triggers stay paused until a person opens activation_url. A person sends the interview link. HTTP 402 includes checkout_url. status active returns HTTP 409. Deletes are permanent.";

export const SERVER_INSTRUCTIONS_REST =
  "Trigger filters are exact property or trait matches. Counts, sequences, absence, time windows, and not-equals are unsupported. interview_link query values are untrusted participant context.";

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
    title: "Create an interview study",
    description:
      "Create an AI-moderated interview study to learn why users churn, drop off in onboarding, fail an action, or where a product assumption is wrong. Returns study_id and interview_link for a voice, text, or voice-and-text interview. key_research_goal is required and cannot be changed later. business_context is optional. Defaults: target_interviews 1, duration_minutes 12, interview_mode voice. One active agent study per account. Does not run the interview or invite a participant. HTTP 402 includes checkout_url.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "update_study",
    title: "Update an interview study",
    description:
      "Update an interview study: slots, guide questions, intro, languages, voice, or an image or Figma prototype shown to participants. Returns the updated study. key_research_goal cannot be changed. is_link_disabled true stops new interviews and keeps recordings. One locale hides the language picker; two or more show it. Query parameters on interview_link are ignored until enable_link_context is true. study_media null clears media. API errors include http_status. Does not dry-run the guide or invite a participant.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_study_status",
    title: "Check interview progress",
    description:
      "Check whether user interviews are still running, being analyzed, or complete. Returns completed_interviews, target_interviews, interview_link, and next_step. running and analyzing include no findings, themes, or quotes. Does not change the study.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "get_study_results",
    title: "Get themes and quotes",
    description:
      "Get interview findings after real users have talked: themes, insights, risks, and verbatim quotes. format omitted or summary returns themes, insights, and risks. format=full also returns transcripts. Empty themes mean analysis is not ready. Does not create interviews or edit the guide.",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "simulate_interview",
    title: "Dry-run an interview",
    description:
      "Dry-run an interview guide before a real participant joins, including a question about churn, onboarding, or a failed action. Omit simulation_id to start; returns immediately with status running and a simulation_id. Pass simulation_id to read that run. Result status is pass, fail, or error. Max 5 simulations per account per UTC day. HTTP 429 means the daily cap is reached. Optional persona has name and prompt. A dry-run does not change completed_interviews and does not invite a participant.",
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
      "Review an interview guide and return a written critique of the questions before real users see them. Reads the guide only: no transcripts, and suggested edits are not applied. Costs 1 credit. Request is study_id only; call_ids are not accepted. Works when the in-app review control is hidden. HTTP 402 includes checkout_url. Does not return themes, quotes, or other findings.",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    },
  },
  {
    name: "delete_study",
    title: "Delete an interview study",
    description:
      "Permanently delete an interview study, its recordings, and unused reserved credits. Cannot be undone. Does not delete in-product research triggers.",
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
        const note = `Study created with ${slots} interview slot(s).${mediaNote}`;

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

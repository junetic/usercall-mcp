#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PACKAGE_VERSION = "0.2.0";
const apiKey = process.env.USERCALL_API_KEY;
const baseUrl = process.env.USERCALL_BASE_URL ?? "https://app.usercall.co";

if (!apiKey) {
  throw new Error("Missing USERCALL_API_KEY");
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

function endpoint(path: string) {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function callUsercallApi(path: string, init?: RequestInit) {
  const response = await fetch(endpoint(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
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

async function main() {
  const server = new McpServer({
    name: "usercall-mcp",
    version: PACKAGE_VERSION,
  });

  server.tool(
    "create_study",
    "Creates a user interview study and returns study_id plus an interview_link to share with participants. One active agent study is allowed per personal account. Optional interview_mode: voice (default), text, or voice_and_text. Optionally include study_media to show an image or Figma prototype during the interview. On insufficient credits the API returns 402 with checkout_url.",
    {
      key_research_goal: z
        .string()
        .min(5)
        .max(2000)
        .describe("Research goal for the study. Cannot be changed later."),
      business_context: z.string().min(5).max(2000),
      additional_context_prompt: z.string().optional(),
      target_interviews: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Interview slots to create. Defaults to 1 if omitted."),
      language: z
        .enum(["auto", "en", "ko"])
        .optional()
        .describe("Interview language. Defaults to auto."),
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
      metadata: z.record(z.string(), z.unknown()).optional(),
      study_media: studyMediaSchema.optional(),
    },
    {
      title: "Create study",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: true,
    },
    async (input) => {
      try {
        const payload = await callUsercallApi("/api/v1/agent/studies", {
          method: "POST",
          body: JSON.stringify(input),
        });

        const slots = input.target_interviews ?? 1;
        const note = input.study_media
          ? `Study created with ${slots} interview slot(s) and media attachment. Share the interview_link with participants (media visible on web only). Use update_study to change slots, guide copy, or media.`
          : `Study created with ${slots} interview slot(s). Share the interview_link with participants. Use update_study to change slots, guide copy, or media.`;

        return result(appendNote(payload, note));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "update_study",
    "Updates an existing study. Use this to change interview slots, interview mode, guide copy, questions, or media. Research goal cannot be changed. Pass study_media: null to clear media.",
    {
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
        .array(z.string())
        .optional()
        .describe("Interview questions to ask participants, in order."),
      interview_mode: z
        .enum(["voice", "text", "voice_and_text"])
        .optional()
        .describe("How participants take the interview."),
      study_media: studyMediaSchema
        .nullable()
        .optional()
        .describe(
          "Visual stimulus shown during all interview questions (web participants only). Pass null to clear.",
        ),
    },
    {
      title: "Update study",
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
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

  server.tool(
    "get_study_status",
    "Returns the current lifecycle status of a study: running, analyzing, or complete. Includes progress fields such as completed_interviews and target_interviews.",
    {
      study_id: z.string().uuid(),
    },
    {
      title: "Get study status",
      readOnlyHint: true,
    },
    async (input) => {
      const payload = await callUsercallApi(
        `/api/v1/agent/studies/${input.study_id}`,
      );
      return result(payload);
    },
  );

  server.tool(
    "get_study_results",
    "Returns analysis results. When presenting results, always quote specific participant responses verbatim using the quotes field in each theme.",
    {
      study_id: z.string().uuid(),
      format: z.enum(["summary", "full"]).optional(),
    },
    {
      title: "Get study results",
      readOnlyHint: true,
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

  server.tool(
    "delete_study",
    "Permanently deletes a study and all associated data. Releases unused reserved credits.",
    {
      study_id: z.string().uuid(),
    },
    {
      title: "Delete study",
      readOnlyHint: false,
      destructiveHint: true,
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

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.stderr.write(
    `[usercall-mcp] failed to start: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  process.exit(1);
});

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const apiKey = process.env.USERCALL_API_KEY;
const baseUrl = process.env.USERCALL_BASE_URL ?? "https://app.usercall.co";

if (!apiKey) {
  throw new Error("Missing USERCALL_API_KEY");
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
    try {
      const payload = JSON.parse(text);
      if (typeof payload?.message === "string") message = payload.message;
    } catch {}
    throw new Error(message);
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
    version: "0.1.0",
  });

  server.tool(
    "create_study",
    "Creates a user interview study and returns an interview_link to share with participants. Starts with 1 interview slot. Optionally include study_media to show an image or Figma prototype during the interview.",
    {
      key_research_goal: z.string(),
      business_context: z.string(),
      additional_context_prompt: z.string().optional(),
      language: z.enum(["auto", "en"]).optional(),
      duration_minutes: z.number().int().positive().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
      study_media: z
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
        .optional()
        .describe(
          "Visual stimulus shown during all interview questions (web participants only)",
        ),
    },
    async (input) => {
      const payload = await callUsercallApi("/api/v1/agent/studies", {
        method: "POST",
        body: JSON.stringify({ ...input, target_interviews: 1 }),
      });

      const note = input.study_media
        ? "Study created with 1 interview slot and media attachment. Share the interview_link with 1 participant (media visible on web only). Use update_study to add more slots."
        : "Study created with 1 interview slot. Share the interview_link with 1 participant. Use update_study to add more slots.";

      return result(appendNote(payload, note));
    },
  );

  server.tool(
    "update_study",
    "Updates an existing study. Use this to increase interview slots, add/update media, or modify the interview guide.",
    {
      study_id: z.string().uuid(),
      target_interviews: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Total number of interview slots for this study."),
      is_link_disabled: z.boolean().optional(),
      study_media: z
        .object({
          type: z
            .enum(["image", "prototype"])
            .describe(
              "Media type: 'image' for direct image URLs (.png, .jpg, .gif, .webp) or 'prototype' for Figma prototype URLs",
            ),
          url: z.string().url().describe("Public URL to the image or Figma prototype"),
          description: z
            .string()
            .max(500)
            .optional()
            .describe("Alt text / context shown to participants"),
        })
        .optional()
        .describe(
          "Visual stimulus shown during all interview questions (web participants only)",
        ),
    },
    async (input) => {
      const { study_id, ...body } = input;
      const payload = await callUsercallApi(
        `/api/v1/agent/studies/${study_id}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        },
      );
      return result(payload);
    },
  );

  server.tool(
    "get_study_status",
    {
      study_id: z.string().uuid(),
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

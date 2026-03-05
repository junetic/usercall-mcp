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

async function main() {
  const server = new McpServer({
    name: "usercall-mcp",
    version: "0.1.0",
  });

  server.tool(
    "create_study",
    {
      key_research_goal: z.string(),
      business_context: z.string(),
      additional_context_prompt: z.string().optional(),
      target_interviews: z.number().int().positive().default(1),
      language: z.enum(["auto", "en"]).optional(),
      duration_minutes: z.number().int().positive().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    },
    async (input) => {
      const payload = await callUsercallApi("/api/v1/agent/studies", {
        method: "POST",
        body: JSON.stringify(input),
      });

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
    {
      study_id: z.string().uuid(),
      format: z.enum(["summary", "full"]).optional(),
    },
    async (input) => {
      const format = input.format ?? "summary";
      const payload = await callUsercallApi(
        `/api/v1/agent/studies/${input.study_id}/results?format=${format}`,
      );
      return result(payload);
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

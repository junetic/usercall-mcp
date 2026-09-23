#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createUsercallServer } from "./server.js";

const apiKey = process.env.USERCALL_API_KEY;
const baseUrl = process.env.USERCALL_BASE_URL ?? "https://app.usercall.co";

if (!apiKey) {
  throw new Error("Missing USERCALL_API_KEY");
}

async function main() {
  const server = createUsercallServer({ apiKey: apiKey as string, baseUrl });
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

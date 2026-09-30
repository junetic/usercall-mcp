import { writeFileSync } from "node:fs";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { PACKAGE_VERSION, createUsercallServer } from "../src/server.js";

const server = createUsercallServer({
  apiKey: "metadata-only",
  baseUrl: "https://app.usercall.test",
  fetchImpl: async () => new Response("{}"),
});
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
const client = new Client({ name: "tools-list-dump", version: PACKAGE_VERSION });
await client.connect(clientTransport);

const { tools } = await client.listTools();
const dump = {
  source:
    "Local stdio server over an in-memory transport. No Usercall API call and no hosted OAuth.",
  server: "usercall-mcp",
  version: PACKAGE_VERSION,
  instructions: client.getInstructions(),
  tools: tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    annotations: tool.annotations,
    inputSchema: tool.inputSchema,
  })),
};

writeFileSync(
  new URL("../fixtures/tools-list.json", import.meta.url),
  `${JSON.stringify(dump, null, 2)}\n`,
);
console.log(`wrote ${dump.tools.length} tools`);

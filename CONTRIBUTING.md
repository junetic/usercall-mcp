# Contributing

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Run locally:

```bash
USERCALL_API_KEY="your_key_here" pnpm dev
```

## Pull Requests

- Keep changes minimal and focused.
- Do not commit secrets or `.env` files.
- Ensure `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- If you change tool descriptions, server instructions, or a Research Trigger tool, copy that change into the hosted MCP in the main app (`apps/web/app/api/mcp`) and redeploy it. `https://mcp.usercall.co` serves that Vercel app (`/api/mcp`), not this package. Refresh `fixtures/tool-manifest.json` when names, annotations, or input keys change.
- Update `README.md` when tool behavior or env requirements change.

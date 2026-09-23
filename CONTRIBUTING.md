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
- If you change a Research Trigger tool, update the hosted MCP in the main app too and refresh `fixtures/tool-manifest.json`.
- Update `README.md` when tool behavior or env requirements change.

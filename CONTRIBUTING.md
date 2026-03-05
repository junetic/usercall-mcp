# Contributing

## Development

```bash
pnpm install
pnpm typecheck
pnpm build
```

Run locally:

```bash
USERCALL_API_KEY="your_key_here" pnpm dev
```

## Pull Requests

- Keep changes minimal and focused.
- Do not commit secrets or `.env` files.
- Ensure `pnpm typecheck` and `pnpm build` pass.
- Update `README.md` when tool behavior or env requirements change.

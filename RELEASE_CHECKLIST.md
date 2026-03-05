# Release Checklist

Use this before creating the standalone GitHub repo or publishing.

## Code + Contract

- [ ] Tool names and input/output match Usercall Agent API v1.
- [ ] No provider-specific internals are exposed in public tool responses.
- [ ] Error messages are clear and safe.

## Security

- [ ] No secrets committed (`.env`, API keys, tokens).
- [ ] `.env.example` is up to date.

## Quality

- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] `pnpm smoke` succeeds against target base URL.

## Docs + Metadata

- [ ] `README.md` includes setup, env, tools, and troubleshooting.
- [ ] `LICENSE` is present.
- [ ] Package metadata in `package.json` is correct.

## Repo Setup (when creating new repo)

- [ ] Initialize new repo from `usercall-mcp/` contents only.
- [ ] Add CI for typecheck/build/smoke.
- [ ] Tag initial release (`v0.1.0` or chosen version).

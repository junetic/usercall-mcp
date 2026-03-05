# Usercall MCP

Lightweight MCP server for Usercall Agent API v1.

AI agents can build products now — Usercall MCP lets them talk to real users.

Run real user interviews directly from your AI agent.

Usercall MCP lets AI agents create interview studies, share interview links with users, and retrieve structured insights like themes and quotes.

This allows agent workflows to incorporate **real user feedback**, not just analytics or synthetic simulations.

This package exposes MCP tools so agent clients (Cursor, Claude Desktop, other MCP-compatible clients) can:

- create interview studies,
- poll study status,
- retrieve study results.

It is intentionally minimal and provider-agnostic.

## Example Workflow

An agent can run a quick user research loop:

1. Call `create_study`
2. Share the returned `interview_link` with users
3. Poll `get_study_status`
4. Fetch insights using `get_study_results`

Example response:

{
"themes": [
{
"name": "Onboarding confusion",
"summary": "Users struggled to understand the second step of onboarding.",
"quotes": [
"I wasn't sure what the app was asking me to do."
]
}
]
}

The returned interview link can be shared with participants through any channel (email, Slack, Discord, in-product prompts, etc.).

## Requirements

- Node.js 18+ (Node 20+ recommended)
- A valid Usercall API key

Get an API key from Usercall web app (`https://app.usercall.co`):

1. Sign in at `https://app.usercall.co`
2. Go to `Home -> Developer`
3. Click **Create API key**
4. Copy the key (shown once)

## Environment Variables

- `USERCALL_API_KEY` (required)
- `USERCALL_BASE_URL` (optional, default: `https://usercall.co`)

See `.env.example`.

## Install

```bash
pnpm install
pnpm build
```

## Run (stdio MCP server)

```bash
USERCALL_API_KEY="your_key_here" pnpm start
```

For local development:

```bash
pnpm dev
```

## MCP Tools

### `create_study`

Creates a new agent study and reserves credits up front.

Input:

- `key_research_goal` (string)
- `business_context` (string)
- `additional_context_prompt?` (string)
- `target_n?` (number)
- `language?` (`auto | en | ko`)
- `duration_minutes?` (number)
- `metadata?` (record)

### `get_study_status`

Fetches lifecycle status.

Input:

- `study_id` (uuid string)

Output status values:

- `running`
- `analyzing`
- `complete`

### `get_study_results`

Fetches analysis output.

Input:

- `study_id` (uuid string)
- `format?` (`summary | full`)

## Smoke Test

```bash
USERCALL_API_KEY="your_key_here" \
USERCALL_BASE_URL="https://usercall.co" \
pnpm smoke
```

The smoke test sends a minimal create-study request and prints HTTP status + truncated payload.

## Troubleshooting

- **`Missing USERCALL_API_KEY`**: set the env var before start.
- **401 unauthorized**: invalid/revoked/expired API token.
- **402 insufficient credits**: add credits and retry.
- **500 on create**: verify your API key can access Usercall v1 endpoints and server-side env is configured.

## Security Notes

- Never commit raw API keys.
- Use `.env` locally; CI should use secret variables.
- This package does not expose provider-specific internal IDs in API responses.
- Avoid exposing API keys in agent prompts, logs, or public repositories.

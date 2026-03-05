# Usercall MCP

**AI can build products. But it still doesn't talk to users.**

Usercall MCP fixes that — run real user interviews directly from your AI agent.

```
Agent: "Why are users confused about onboarding?"

→ create_study       returns interview_link
→ share with users   collect responses
→ get_study_results  returns themes and quotes
```

```json
{
  "themes": [
    {
      "name": "Onboarding confusion",
      "summary": "Users struggled to understand the second step.",
      "quotes": [
        "I wasn't sure what the app was asking me to do.",
        "I didn't know I had to verify my email before continuing."
      ]
    },
    {
      "name": "Pricing confusion",
      "summary": "Free plan limits were not clearly communicated.",
      "quotes": [
        "I wasn't sure if the free plan included analytics."
      ]
    }
  ]
}
```

---

## Quick start

### 1. Get an API key

Sign in at [app.usercall.co](https://app.usercall.co) → **Home → Developer → Create API key**

### 2. Add to your MCP client

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "usercall": {
      "command": "npx",
      "args": ["-y", "@usercall/mcp"],
      "env": {
        "USERCALL_API_KEY": "your_key_here"
      }
    }
  }
}
```

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "usercall": {
      "command": "npx",
      "args": ["-y", "@usercall/mcp"],
      "env": {
        "USERCALL_API_KEY": "your_key_here"
      }
    }
  }
}
```

Restart your client. The three tools below will be available immediately.

---

## Tools

### `create_study`

Creates an interview study and returns an `interview_link` to share with participants.

| Field | Type | Required |
|---|---|---|
| `key_research_goal` | string | yes |
| `business_context` | string | yes |
| `additional_context_prompt` | string | no |
| `target_interviews` | number | no |
| `language` | `auto \| en \| ko` | no |
| `duration_minutes` | number | no |
| `metadata` | object | no |

### `get_study_status`

Returns the current lifecycle status of a study.

| Field | Type |
|---|---|
| `study_id` | uuid string |

Status values: `running` · `analyzing` · `complete`

Response includes interview progress fields, including
`completed_interviews` and `target_interviews`.

### `get_study_results`

Returns analysis output once the study is complete.

| Field | Type | Required |
|---|---|---|
| `study_id` | uuid string | yes |
| `format` | `summary \| full` | no |

Summary/full responses include study progress fields and analysis output.

---

## Example workflow

```
1. create_study
   key_research_goal: "Why do users drop off during onboarding?"
   business_context: "B2B SaaS, 3-step signup flow"

   → returns { study_id, interview_link }

2. Share interview_link with participants
   (email, Slack, in-product prompt, etc.)

3. get_study_status
   → "analyzing"

4. get_study_results
   → themes, summaries, verbatim quotes
```

---

## Requirements

- Node.js 18+
- A valid Usercall API key

---

## Self-hosting / development

```bash
pnpm install
pnpm build
USERCALL_API_KEY="your_key_here" pnpm start
```

Smoke test:

```bash
USERCALL_API_KEY="your_key_here" pnpm smoke
```

---

## Troubleshooting

| Error | Fix |
|---|---|
| `Missing USERCALL_API_KEY` | Set the env var before starting |
| `401 Unauthorized` | Invalid or revoked API key |
| `402 Insufficient credits` | Add credits at app.usercall.co |
| `500` on create | Verify your key has access to Agent API v1 |

---

## License

MIT

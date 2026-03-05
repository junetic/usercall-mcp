# Usercall MCP

[![npm](https://img.shields.io/npm/v/@usercall/mcp)](https://www.npmjs.com/package/@usercall/mcp)
[![License](https://img.shields.io/github/license/junetic/usercall-mcp)](LICENSE)

**AI can build products. But it still doesn't talk to users.**

Usercall MCP lets AI agents run real user interviews and return structured insights with themes and traceable user quotes.

<video src="https://github.com/user-attachments/assets/8af1ccaf-25e6-4b73-b7aa-16c2753ad648" autoplay loop muted playsinline></video>

```
Agent: "Why are users confused about onboarding?"

→ create_study       returns interview_link
→ share with users   collect responses
→ get_study_results  returns themes and quotes
```

The returned `interview_link` can be shared with participants through email, Slack, Discord, or in-product prompts.

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
      "quotes": ["I wasn't sure if the free plan included analytics."]
    }
  ]
}
```

## How it works

AI Agent

↓

Usercall MCP

↓

Usercall Agent API

↓

Real user interviews

↓

Themes and verbatim quotes returned to the agent

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

---

## Example agent prompt

Once installed, you can ask your AI agent to run research like this:

```
Run user interviews to understand why users drop off during onboarding.

Context:
- B2B SaaS product
- 3-step signup flow
- Drop-off occurs between step 2 and step 3

Goal:
Identify the main sources of confusion and friction.

Target interviews: 5
Language: en

Show participants this prototype during the interview:
https://www.figma.com/proto/abcd1234/onboarding-flow
```

The agent will:

1. create a study
2. attach the prototype as interview stimulus
3. return an interview link
4. collect user responses
5. retrieve themes and verbatim quotes

---

### Structured example

```
create_study
key_research_goal: "Understand why users drop off during onboarding"
business_context: "B2B SaaS signup flow"
target_interviews: 5
language: "en"

study_media:
  type: "prototype"
  url: "https://www.figma.com/proto/abcd1234/onboarding-flow"
  description: "New onboarding flow concept"
```

Restart your client. The three tools below will be available immediately.

---

## Tools

### `create_study`

Creates an interview study and returns an `interview_link` to share with participants.

| Field                       | Type               | Required |
| --------------------------- | ------------------ | -------- |
| `key_research_goal`         | string             | yes      |
| `business_context`          | string             | yes      |
| `additional_context_prompt` | string             | no       |
| `target_interviews`         | number             | no       |
| `language`                  | `auto \| en \| ko` | no       |
| `duration_minutes`          | number             | no       |
| `metadata`                  | object             | no       |
| `study_media`               | object             | no       |

**study_media** (optional) — visual stimulus shown during all interview questions:

| Field         | Type                   | Required |
| ------------- | ---------------------- | -------- |
| `type`        | `image \| prototype`   | yes      |
| `url`         | string (URL)           | yes      |
| `description` | string (max 500 chars) | no       |

- `image`: Direct image URL (`.png`, `.jpg`, `.gif`, `.webp`)
- `prototype`: Figma prototype URL (converted to interactive embed)
- Media is only visible to web participants; phone callers won't see it

### `update_study`

Updates an existing study. Use this to increase interview slots, add/update media, or disable the link.

| Field               | Type        | Required |
| ------------------- | ----------- | -------- |
| `study_id`          | uuid string | yes      |
| `target_interviews` | number      | no       |
| `is_link_disabled`  | boolean     | no       |
| `study_media`       | object      | no       |

The `study_media` object follows the same schema as in `create_study`.

### `get_study_status`

Returns the current lifecycle status of a study.

| Field      | Type        |
| ---------- | ----------- |
| `study_id` | uuid string |

Status values: `running` · `analyzing` · `complete`

Response includes interview progress fields, including
`completed_interviews` and `target_interviews`.

### `get_study_results`

Returns analysis output once the study is complete.

| Field      | Type              | Required |
| ---------- | ----------------- | -------- |
| `study_id` | uuid string       | yes      |
| `format`   | `summary \| full` | no       |

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
   → themes + verbatim quotes returned to the agent
```

### With visual stimulus

```
1. create_study
   key_research_goal: "Get feedback on new dashboard design"
   business_context: "Redesigning analytics dashboard for power users"
   study_media:
     type: "image"
     url: "https://example.com/dashboard-mockup.png"
     description: "New dashboard design concept"

   → returns { study_id, interview_link }

2. Share interview_link — participants see the mockup during interview
```

For Figma prototypes, use `type: "prototype"` with a Figma proto URL.

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

| Error                      | Fix                                        |
| -------------------------- | ------------------------------------------ |
| `Missing USERCALL_API_KEY` | Set the env var before starting            |
| `401 Unauthorized`         | Invalid or revoked API key                 |
| `402 Insufficient credits` | Add credits at app.usercall.co             |
| `500` on create            | Verify your key has access to Agent API v1 |

---

## License

MIT

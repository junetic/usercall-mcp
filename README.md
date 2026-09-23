# Usercall MCP - AI agents that run real user interviews

[![npm](https://img.shields.io/npm/v/@usercall/mcp)](https://www.npmjs.com/package/@usercall/mcp)
[![License](https://img.shields.io/github/license/junetic/usercall-mcp)](LICENSE)

**AI can build products. But it still doesn't talk to users.**

Usercall MCP lets AI agents run user interviews via voice or text and return structured insights with themes and verbatim quotes.

<video src="https://github.com/user-attachments/assets/8af1ccaf-25e6-4b73-b7aa-16c2753ad648" autoplay loop muted playsinline></video>


## Why this exists

AI agents can now build and ship products extremely quickly.

But most agents still rely on synthetic feedback or assumptions about users.

Usercall MCP lets agents gather real qualitative feedback directly from users.

---

## Choose a connection

### Recommended: hosted MCP (Claude, ChatGPT, Cursor, Grok Bot)

Add **`https://mcp.usercall.co`** as a remote MCP connector / custom connector.

- OAuth sign-in (no API key, no `npx`)
- Same tools as this package (studies + Research Triggers)
- Docs: [app.usercall.co/docs/mcp](https://app.usercall.co/docs/mcp)
- Cursor Directory / Grok Bot: this repo ships `.mcp.json` so [cursor.directory](https://cursor.directory) can install the hosted connector. Grok Bot cannot run the local `npx` package.

### This package: local / API-key / machine-to-machine

Use `@usercall/mcp` over stdio when you want a Bearer API key (scripts, local clients, M2M).

1. Sign in at [app.usercall.co](https://app.usercall.co) → **Home → Developer → Create API key**
2. Run `npx -y @usercall/mcp` with `USERCALL_API_KEY`

---

## Example workflow

```
Agent: "Why are users confused about onboarding?"

→ create_study
→ share interview_link with users
→ get_study_results
```

The returned `interview_link` can be shared with participants through email, Slack, Discord, or [in-product prompts](https://www.usercall.co/research-triggers).

Example result:

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

Usercall MCP (hosted OAuth **or** this stdio package)

↓

Usercall Agent API

↓

Real user interviews

↓

Themes and verbatim quotes returned to the agent

With **Research Triggers**, the agent can also target users in your product:

Analytics MCP (PostHog, Mixpanel, …) finds a behavior

↓

Usercall MCP creates a study and a **paused** Research Trigger

↓

You activate it in Usercall

↓

The Usercall SDK invites matching users to an interview right after the behavior

---

## Research Triggers

Analytics tells an agent *what* users do. Research Triggers let it ask them *why*.

```
User:  "Look at our PostHog data and find something worth investigating."

Agent (PostHog MCP):  users who test a study rarely launch one.

Agent (Usercall MCP):
  list_trigger_events()                  → study_tested, study_launched, …
  get_trigger_event_schema("study_tested")
                                         → properties: source, interview_type
                                           traits: plan ("free", "pro"), account_type
  create_study(...)  or  list_studies()
  create_research_trigger({
    study_id, event_name: "study_tested",
    traits: { plan: "free" }, sampling_percent: 25, max_invites_per_day: 10
  })                                     → status: "paused", summary, activation_url

Agent: "I've prepared a Research Trigger. When: study_tested · Audience: plan = free ·
        25% sampled · max 10 invites/day. It's paused — activate it here: <activation_url>"
```

- **The Usercall SDK has to be installed.** If `list_trigger_events` returns nothing, call `get_trigger_sdk_setup` (with your analytics provider and event names) to get the snippet. Coding agents can install it for you.
- **Only events Usercall has actually received can be used.** Filters are exact matches on event **properties** or user **traits**. `get_trigger_event_schema` shows which field is which.
- **Unsupported conditions are rejected, not silently dropped.** These include event counts, sequences, absence ("did not do X"), time windows, and not-equals. `get_trigger_capabilities` returns the full list.

---

## Local install (API key)

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

For Claude, ChatGPT, or Cursor **remote** connectors, prefer `https://mcp.usercall.co` instead of this JSON config.

Restart your MCP client.

### 3. Ask your agent

```
Run user interviews to understand why users drop off during onboarding.

Context:
- B2B SaaS product
- 3-step signup flow

Goal:
Identify confusion points and friction.

Target interviews: 5
Language: ko
Interview mode: voice

Show participants this prototype during the interview:
https://www.figma.com/proto/abcd1234/onboarding-flow
```

The agent will:

1. create a study
2. return an interview link
3. collect responses
4. return themes and verbatim quotes

---

## Structured tool example

Equivalent `create_study` tool call:

```
create_study
key_research_goal: "Understand why users drop off during onboarding"
business_context: "B2B SaaS signup flow"
target_interviews: 5
language: "en"
interview_mode: "voice"

study_media:
  type: "prototype"
  url: "https://www.figma.com/proto/abcd1234/onboarding-flow"
  description: "New onboarding flow concept"
```

---

## Tools

### `create_study`

Creates an interview study and returns `study_id` plus an `interview_link` to share with participants.

One active agent study is allowed per personal account. If credits are insufficient, the API returns **402** with `checkout_url`.

| Field                       | Type                                 | Required | Default |
| --------------------------- | ------------------------------------ | -------- | ------- |
| `key_research_goal`         | string (5–2000)                      | yes      |         |
| `business_context`          | string (5–2000)                      | yes      |         |
| `additional_context_prompt` | string                               | no       |         |
| `target_interviews`         | number (1–200)                       | no       | `1`     |
| `language`                  | `auto \| en \| ko`                   | no       | `auto`  |
| `duration_minutes`          | number (5–65)                        | no       | `12`    |
| `interview_mode`            | `voice \| text \| voice_and_text`    | no       | `voice` |
| `metadata`                  | object                               | no       |         |
| `study_media`               | object                               | no       |         |

Research goal cannot be changed after create.

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

Updates an existing study. Use this to change interview slots, interview mode, guide copy, questions, or media. Research goal cannot be changed.

| Field                    | Type                              | Required |
| ------------------------ | --------------------------------- | -------- |
| `study_id`               | uuid string                       | yes      |
| `target_interviews`      | number (1–200)                    | no       |
| `is_link_disabled`       | boolean                           | no       |
| `ai_agent_intro_message` | string                            | no       |
| `key_learning_goals`     | string                            | no       |
| `workflow_end_message`   | string                            | no       |
| `workflow_questions`     | string[]                          | no       |
| `interview_mode`         | `voice \| text \| voice_and_text` | no       |
| `study_media`            | object or `null`                  | no       |

Pass `study_media: null` to clear media. The `study_media` object follows the same schema as in `create_study`.

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

### `delete_study`

Permanently deletes a study and all associated data (recordings, transcripts). Releases unused reserved credits.

| Field      | Type        | Required |
| ---------- | ----------- | -------- |
| `study_id` | uuid string | yes      |

### Research Trigger tools

| Tool                       | Purpose                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `get_trigger_capabilities` | What triggers support and what they don't                                                                 |
| `get_trigger_sdk_setup`    | SDK install snippet for `posthog`, `mixpanel`, `amplitude`, `segment`, `ga4` or `custom`, plus an `identify` snippet and install status |
| `list_trigger_events`      | Events Usercall has received for your account in the last 30 days                                         |
| `get_trigger_event_schema` | Observed properties vs traits for one event, with types and sample values                                 |
| `list_studies`             | Studies in your account that a trigger can use                                                            |
| `create_research_trigger`  | Create a **paused** trigger; returns `trigger_id`, `summary`, `activation_url`, `warnings`                |
| `list_research_triggers`   | All triggers with status and summary                                                                      |
| `get_research_trigger`     | One trigger with invite/interview counts                                                                  |
| `update_research_trigger`  | Change targeting, sampling, cooldown, daily cap or intercept copy; `status: "paused"` pauses              |
| `delete_research_trigger`  | Delete a trigger                                                                                          |

#### `create_research_trigger`

| Field                 | Type                                                 | Required | Default |
| --------------------- | ---------------------------------------------------- | -------- | ------- |
| `study_id`            | uuid string                                          | yes      |         |
| `event_name`          | string (from `list_trigger_events`)                  | yes      |         |
| `properties`          | object of exact-match values                         | no       |         |
| `traits`              | object of exact-match values                         | no       |         |
| `url`                 | `{ match: equals \| contains \| starts_with, value }` | no       |         |
| `dwell_seconds`       | 1–600 (page-visit triggers only)                     | no       |         |
| `source`              | `page_visit` \| `analytics_event` \| `custom`        | no       |         |
| `sampling_percent`    | 1–100                                                | no       | 100     |
| `cooldown_days`       | 0–365                                                | no       | 30      |
| `max_invites_per_day` | 1–100                                                | no       | 100     |
| `intercept_title`     | string (≤120), small label above the prompt          | no       | default |
| `intercept_body`      | string (≤500), prompt text                           | no       | default |
| `delivery_method`     | `intercept` \| `webhook`                              | no       | intercept |
| `webhook_url`         | public https URL (required for `webhook`)            | no       |         |
| `webhook_secret`      | string (16–200), HMAC key, write-only                | no       |         |
| `name`                | string (≤100)                                        | no       | generated |

For page-visit triggers, use `source: "page_visit"` and `event_name: "$pageview"`, with `url` and optionally `dwell_seconds`.

**Delivery.**

- `intercept` (default) shows the Usercall widget in your product, and the user takes a voice or text interview in the page. The modes come from the study; `list_studies` returns each study's `interview_mode`.
- `webhook` POSTs each matched user to `webhook_url`, with their user ID, email if known, traits, event properties and a personal interview link. If `webhook_secret` is set, requests carry an `x-usercall-signature` HMAC header.
- Only public `https` URLs are accepted, and the activation page shows the destination before a person activates the trigger.

### Safety

- **Agents cannot activate triggers.** Triggers are always created **paused**. Calling `update_research_trigger` with `status: "active"` returns HTTP 409 and the `activation_url`. A person has to open that link, review who will be invited, what they will see and the credit cost, and click **Activate**.
- **Changes to an active trigger need re-approval.** Changing an active trigger's configuration pauses it again.
- **Secret keys are never returned.** The ingestion secret key never comes back from any tool.

---

## Example workflow

```
1. create_study
   key_research_goal: "Why do users drop off during onboarding?"
   business_context: "B2B SaaS, 3-step signup flow"
   target_interviews: 5
   language: "ko"
   interview_mode: "voice"

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
- A valid Usercall API key (local / API-key path only)

---

## Self-hosting / development

```bash
pnpm install
pnpm build
USERCALL_API_KEY="your_key_here" pnpm start
```

Tests and smoke tests:

```bash
pnpm test                                   # unit + MCP contract tests
USERCALL_API_KEY="your_key_here" pnpm smoke # creates a real study
USERCALL_API_KEY="your_key_here" SMOKE_STUDY_ID="<uuid>" SMOKE_EVENT_NAME="<observed event>" pnpm smoke:triggers
```

---

## Troubleshooting

| Error                      | Fix                                                                 |
| -------------------------- | ------------------------------------------------------------------- |
| `Missing USERCALL_API_KEY` | Set the env var before starting this stdio package                  |
| `401 Unauthorized`         | Invalid or revoked API key                                          |
| `402 Insufficient credits` | Open the returned `checkout_url`, or add credits at app.usercall.co |
| `500` on create            | Verify your key has access to Agent API v1                          |
| `event_not_observed`       | Usercall hasn't received the event. Add it to your SDK allowlist (`get_trigger_sdk_setup(events=[...])`), trigger it in your app, then retry |
| `wrong_placement`          | The field is a trait, not a property (or the reverse). Use the suggested fix in the error |
| Trait filters never match  | Call `window.usercall.identify({ userId, traits })` when the user is known (see `identify_snippet`) |
| `webhook_url_not_allowed`  | Use a public `https` URL, without credentials; localhost and private IPs are rejected |
| `409 activation_required`  | Expected: agents can't activate. Share `activation_url` with the user |
| Active trigger never fires | Check the event is still arriving (`list_trigger_events`), and check the values match exactly (case and type) |

Remote Claude / ChatGPT / Cursor connectors should use `https://mcp.usercall.co` (OAuth). This package is the API-key stdio path.

---

## License

MIT

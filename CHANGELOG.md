# Changelog

## Unreleased

- `create_study` accepts `target_question_count` and `max_questions_for_duration` using the in-app guide bands. The max must fit `duration_minutes` at 2.2 minutes per question (5 minutes allows 2, 12 allows 5, 25 allows 11, 45 allows 20, 65 allows 29). A longer band is rejected.
- Tool descriptions, parameter descriptions, and initialize instructions name the research job (churn, onboarding drop-off, failed actions, product assumptions, themes, quotes) and the limits. The first ~512 characters of initialize instructions are that category language plus product facts. Workflow order stays in `skills/run-user-interviews/SKILL.md`.
- Removed the cross-tool order that was written so OpenAI tool search would read a fixed interview sequence from server instructions and from each tool description.

## 0.4.0

- Official MCP Registry metadata: `mcpName` `co.usercall/mcp` and root `server.json`
- Server instructions on initialize: tool order, simulation cap, and human handoff for credits and trigger activation
- Annotations for OpenAI tool search: no tool is open-world, `get_trigger_sdk_setup` is read-only, deletes stay destructive
- Human-readable titles and descriptions that say when to call each tool and how it differs from its siblings
- Add `simulate_interview` and `review_study`. The stdio server now matches the hosted catalog: 17 tools
- `create_study`: `business_context` is optional (`key_research_goal` alone still creates a study); `languages` replaces `language`; add `voice_gender`, `enable_link_context`, and `custom_link_variables`
- `update_study`: add `languages`, `voice_gender`, `enable_link_context`, and `custom_link_variables`; `workflow_questions` is a list of question objects with `text`
- `create_study` tells the agent to simulate before sharing the interview link
- `create_research_trigger` / `update_research_trigger`: add `invite_link_params`
- `update_study` returns the API error body with `http_status`, so a guide update after a failed simulation keeps suggestions
- `get_study_results` returns the API payload. Stay on summary; use full only for a quote
- `create_research_trigger` / `update_research_trigger`: choose `delivery_method` (`intercept` or `webhook`) with `webhook_url` and a write-only `webhook_secret`

## 0.3.0

- Add Research Trigger tools: `get_trigger_capabilities`, `get_trigger_sdk_setup`, `list_trigger_events`, `get_trigger_event_schema`, `list_studies`, `create_research_trigger`, `list_research_triggers`, `get_research_trigger`, `update_research_trigger`, `delete_research_trigger`
- Triggers are always created paused; agents cannot activate (HTTP 409 with `activation_url`)
- Trigger create/update forward unknown conditions to the API, which rejects them with an explanation, instead of silently dropping them
- Add `pnpm test` (tool parity with the hosted MCP via `fixtures/tool-manifest.json`, request mapping, error passthrough), `pnpm smoke:triggers`, and CI
- `run-user-interviews` skill covers the Research Trigger workflow and the "agents cannot activate" rule
- Package the hosted MCP for [cursor.directory](https://cursor.directory): `.mcp.json`, Agent Plugin manifests, Cursor plugin manifest, and `run-user-interviews` skill

## 0.2.0

- Align create/update study tools with Agent API v1 and the hosted catalog at `https://mcp.usercall.co`
- Add `interview_mode` (`voice` | `text` | `voice_and_text`) on create and update
- Add `language: ko` (now `auto` | `en` | `ko`)
- Honor caller `target_interviews` instead of always sending `1`
- Add `update_study` guide fields: `ai_agent_intro_message`, `key_learning_goals`, `workflow_end_message`, `workflow_questions`; allow `study_media: null` to clear
- Add MCP tool titles and annotations
- Surface `checkout_url` on HTTP 402 insufficient credits
- Document hosted MCP as the recommended Claude / ChatGPT / Cursor path; keep this package as the local API-key path

## 0.1.1

- Previous npm release

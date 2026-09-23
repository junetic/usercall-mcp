# Changelog

## Unreleased

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

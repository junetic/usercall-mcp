# Changelog

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

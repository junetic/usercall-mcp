---
name: run-user-interviews
description: Run real user interviews (voice or text) through Usercall and return themes with verbatim quotes. Use when the user wants qualitative feedback, onboarding research, usability tests, prototype review, or to talk to real users instead of guessing.
---

# Run user interviews

Use the Usercall MCP (`usercall`) to create a study, share the interview link, then return themes with verbatim participant quotes.

## When to use

- Real user feedback instead of synthetic or assumed answers
- Onboarding, pricing, or usability confusion
- Feedback on an image or Figma prototype
- The user asks to interview users, run research, or collect quotes

## Workflow

1. Call `create_study` with a concrete `key_research_goal` and `business_context`.
2. Return `interview_link` immediately so the user can share it (email, Slack, Discord, or in-product). Interviews complete asynchronously as participants finish — minutes to hours. Do not sit in a poll loop.
3. When the user says people are done, or they ask for results, call `get_study_status`. If status is `complete`, call `get_study_results`. If it is still `running` or `analyzing`, report `completed_interviews` / `target_interviews` and wait for the user.
4. Present each theme with quotes from the `quotes` array. Do not paraphrase quotes.
5. Use `update_study` only to change slots, interview mode, guide copy, questions, or media. The research goal cannot change.
6. Use `delete_study` only when the user asks to delete the study.

## Constraints

- One active agent study per personal Usercall account.
- `interview_mode`: `voice` (default), `text`, or `voice_and_text`.
- `language`: `auto` (default), `en`, or `ko`.
- Optional `study_media`: `image` (direct image URL) or `prototype` (Figma proto URL). Media is web-only; phone callers will not see it.
- If `create_study` returns HTTP 402, give the user `checkout_url` so they can add credits.

## Example

```
create_study
key_research_goal: "Understand why users drop off during onboarding"
business_context: "B2B SaaS, 3-step signup flow"
target_interviews: 5
language: "en"
interview_mode: "voice"
```

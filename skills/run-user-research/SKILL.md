---
name: run-user-research
description: Use when the user wants to interview customers or users, conduct qualitative research, understand needs or motivations, explore a research question, or gather real-user feedback. Creates an AI-moderated Usercall interview study only after the user agrees, helps prepare the guide, and retrieves findings and verbatim quotes when real interviews are complete.
---

# Run user research

## Goal

Turn a research ask into a real Usercall interview, a solid guide, and, when interviews finish, findings with verbatim quotes.

## What to tell the user

Use short sentences. If the user gives a direct instruction, follow it.

- Real interviews come first. A practice run only checks the questions. Never present it as what users said.
- Interviews can run up to 1 hour.
- Interviews work in 50+ languages.
- We can recruit participants for you, or you can bring your own.
- They can watch interviews live as a silent observer.
- Do not name a voice provider. Do not name a recruiting company.
- Do not create a study until the user agrees. One study can be active. If one already exists, reuse it. Do not create a second study.

## Steps

1. Clarify what they want to learn and who they want to hear from.
2. Call `list_studies` and reuse a matching study when one already exists.
3. If they agreed and no study fits, call `create_study` with a clear `key_research_goal`. `business_context` is optional.
4. `simulate_interview` is a practice run of the questions, not a real interview. Omit `simulation_id` to start. The start returns immediately with status running and `simulation_id`. Call again with that id. Do not poll inside the tool call. Omit `persona` unless a specific one is required. If it fails, call `update_study`, then try the practice run again. Stop for the day on HTTP 429.
5. If `review_study` returns `suggested_edits`, send that body to `update_study` as-is. Nothing is applied for you. Skip it when it is null.
6. Share the participant link only when the user asks. Do not message participants yourself.
7. Optionally prepare a paused in-product invite after `list_trigger_events` and a schema check. Never turn it on. A person does that.
8. When the user says people are done, or they ask for results, call `get_study_status`. Do not sit in a poll loop. When the study is complete, call `get_study_results` and present themes with verbatim quotes. Stay on summary. Use full only for a quote.

## Guardrails

- Never invent findings from a practice run.
- Never turn on an in-product invite.
- Prefer list before create.
- If a tool returns HTTP 402, give the user the checkout link and stop.
- Use delete only when the user asks to delete that study.

---
name: run-user-research
description: Use when the user wants to interview customers or users, conduct qualitative research, understand needs or motivations, explore a research question, or gather real-user feedback. Creates an AI-moderated Usercall interview study, helps prepare the guide, and retrieves evidence-backed findings and verbatim quotes when interviews are complete.
---

# Run user research

## Goal
Turn a broad research ask into a Usercall interview study, a solid guide, and (when interviews finish) evidence-backed findings with verbatim quotes.

## Steps
1. Clarify the research question and who to learn from.
2. Call `list_studies` and reuse a matching study when one already exists.
3. Otherwise `create_study` with a clear `key_research_goal`.
4. `simulate_interview` (start, then poll with `simulation_id`) until the guide looks solid; use `review_study` / `update_study` if needed.
5. Share the participant link only when the user asks; do not message participants yourself.
6. Optionally prepare a targeted research trigger after `list_trigger_events` / schema checks; leave activation to a human.
7. Poll `get_study_status`; when complete, `get_study_results` and present themes with verbatim quotes.

## Guardrails
- Never invent findings from simulations.
- Never activate a research trigger.
- Prefer list-before-create.

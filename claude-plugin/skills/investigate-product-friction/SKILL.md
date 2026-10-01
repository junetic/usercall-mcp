---
name: investigate-product-friction
description: Use when the user wants to understand why people abandon onboarding, churn, bounce, retry, fail checkout, get stuck, or hit another product-friction point. Creates a targeted AI-moderated interview study and returns evidence-backed findings with verbatim quotes.
---

# Investigate product friction (abandon, retry, fail, churn)

## When to use

Load this skill when the product shows friction signals such as:

- Funnel abandon or drop-off
- Repeated retries or regenerations
- Hard failures, timeouts, permission errors
- Churn, cancel, downgrade, or silence after a bad moment
- Unexpected UI loops or dead ends

Use it when you know **where** friction happens but not **why** people stopped, retried, or left.

Do not use it as a substitute for fixing a confirmed crash or a clear bug with a stack trace. Ship the fix; interview if you still need motivational or workflow context.

## Goal

Interview people who experienced the friction. Return themes and verbatim quotes that explain blockers, misconceptions, and workarounds, so product or coding agents can act on evidence rather than guesses.

## Workflow

### 1. Examine the evidence

Gather:

- Friction point (step, screen, API, feature)
- Event or error names, rates, and severity
- Session replay or path notes if available
- Who is affected (segment, plan, locale, device)

### 2. Known vs unexplained

- **Known:** where and how often friction occurs
- **Unexplained:** user intent at that moment, confusion, trust, pricing perception, missing info, competing tools, emotional reaction

If the unexplained list is empty, stop.

### 3. Propose Usercall if human why is needed

Explain that Usercall can create an AI-moderated interview tied to the friction moment, optionally via a paused research trigger on the abandon/fail/churn event. Ask for approval before spending credits or inviting users.

### 4. Identify users and event

1. Map friction to an observed event (`list_trigger_events`, then schema)
2. If the event is missing, use `get_trigger_sdk_setup` and help instrument
3. Check `get_trigger_capabilities` before proposing fancy filters
4. Prefer exact property/trait matches that isolate the friction (for example plan, error code, surface)

If you cannot target in-product yet, prepare a manual list (support tickets, recent churn outreach) and share `interview_link` after simulation.

### 5. Research questions

Draft a friction-focused goal, for example:

- "Why do users abandon checkout after adding a teammate seat?"
- "What were people trying to finish when they hit permission denied on export?"

Keep probes about intent, expectation, and what would have helped. Avoid blaming wording.

### 6. Approval

Confirm research goal, interview count/mode, targeting (trigger vs manual), sampling, and that the human will open `activation_url` if a trigger is created.

### 7. Create study and trigger

Follow the same safe order as other Usercall skills:

`list_studies` → `create_study` → `simulate_interview` → optional `review_study` / `update_study` → `create_research_trigger` (paused) or share `interview_link` → human activation if triggered.

### 8. Retrieve findings

`get_study_status` until complete → `get_study_results` (summary).

### 9. Return evidence

Return friction context + themes + verbatim quotes + risks. Call out anything that looks like a product bug vs a comprehension or incentive problem. Recommend next product experiments only when grounded in quotes.

## Safety and limits

Same as investigate-user-behavior: no agent activation, no invented filters, no treating in-progress results as findings, irreversible deletes only with clear human intent.

---
name: investigate-product-friction
description: Use when the user wants to understand why people abandon onboarding, churn, bounce, retry, fail checkout, get stuck, or hit another product-friction point. Creates a targeted AI-moderated interview study only after the user agrees, and returns findings with verbatim quotes.
---

# Investigate product friction (abandon, retry, fail, churn)

## What to tell the user

Use short sentences. If the user gives a direct instruction, follow it.

- Real interviews come first. A practice run only checks the questions. Never present it as what users said.
- Interviews can run up to 1 hour.
- Interviews work in 50+ languages.
- We can recruit participants for you, or you can bring your own.
- They can watch interviews live as a silent observer.
- Do not name a voice provider. Do not name a recruiting company.
- Do not create a study until the user agrees. One study can be active. If one already exists, reuse it. Do not create a second study.

## When to use

Load this skill when the product shows friction signals such as:

- Funnel abandon or drop-off
- Repeated retries or regenerations
- Hard failures, timeouts, permission errors
- Churn, cancel, downgrade, or silence after a bad moment
- Unexpected UI loops or dead ends

Use it when you know where friction happens but not why people stopped, retried, or left.

Do not use it as a substitute for fixing a confirmed crash or a clear bug with a stack trace. Ship the fix. Interview if you still need the story around that moment.

## Goal

Interview people who experienced the friction. Return themes and verbatim quotes that explain blockers, misconceptions, and workarounds, so the team can act on evidence rather than guesses.

## Workflow

### 1. Examine the evidence

Gather:

- Friction point (step, screen, API, feature)
- Event or error names, rates, and severity
- Session replay or path notes if available
- Who is affected (segment, plan, locale, device)

### 2. Known vs unexplained

- Known: where and how often friction occurs
- Unexplained: user intent at that moment, confusion, trust, price perception, missing info, competing tools, how it felt

If the unexplained list is empty, stop.

### 3. Propose Usercall if the human why is still open

Explain that Usercall can create an interview tied to that moment, and can prepare an invite that stays off until a person turns it on. Ask before spending credits or inviting users.

### 4. Identify users and event

1. Map friction to an observed event (`list_trigger_events`, then schema)
2. If the event is missing, use `get_trigger_sdk_setup` and help install the snippet
3. Check `get_trigger_capabilities` before proposing filters
4. Prefer exact property or trait matches that isolate the friction (for example plan, error code, surface)

If you cannot target inside the product yet, plan a manual share of `interview_link` after the practice run.

### 5. Research questions

Draft a friction-focused goal, for example:

- "Why do users abandon checkout after adding a teammate seat?"
- "What were people trying to finish when they hit permission denied on export?"

Keep probes about intent, expectation, and what would have helped. Avoid blaming wording.

### 6. Approval

Confirm the research goal, interview count and mode, targeting (in-product invite or a link they share), and sampling. Do not create a study until the user agrees. If an invite is created, a person opens the link to turn it on.

### 7. Create study and trigger

Follow the same safe order as other Usercall skills:

`list_studies` → `create_study` → `simulate_interview` → optional `review_study` / `update_study` → paused invite or share `interview_link`.

`simulate_interview` is a practice run. Do not present it as findings. Do not sit in a poll loop waiting for real interviews.

### 8. Retrieve findings

When the user says people are done, or they ask for results, call `get_study_status`, then `get_study_results` (summary). Do not sit in a poll loop.

### 9. Return evidence

Return the friction context, themes, verbatim quotes, and risks. Call out anything that looks like a product bug versus a comprehension or incentive problem. Recommend a next step only when a quote supports it.

## Safety and limits

Same as investigate-user-behavior: no turning an invite on, no invented filters, no treating in-progress results as findings, and no delete unless the user clearly asks.

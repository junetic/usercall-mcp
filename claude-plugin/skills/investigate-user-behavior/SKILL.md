---
name: investigate-user-behavior
description: Use when analytics shows a behavior change, spike, drop, cohort difference, unusual path, or unexpected event and the user wants to understand why. Creates a Usercall interview study only after the user agrees, and can prepare a paused invite for the people who did it.
---

# Investigate user behavior (ask real users why)

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

Load this skill when analytics (PostHog, Mixpanel, Amplitude, GA4, warehouse charts, or similar) already show a real behavioral signal, and the remaining question is why people acted this way.

Examples: a cohort suddenly uses a feature more; two plans diverge on activation; power users take a surprising path; a new feature is used repeatedly without a clear success.

Do not use this skill when the chart already names a tracking gap, a missing feature flag, or a pure instrumentation bug. Fix measurement first.

## Goal

Turn "we see the what" into "here is the why," using interviews with real users and, when the product is instrumented, a paused invite aimed at the people who just did the behavior.

## Workflow

### 1. Examine the evidence

Collect what is already known from analytics or logs:

- Metric or event name, time window, and absolute counts or rates
- Segment filters (plan, locale, platform, cohort)
- Funnel or path context (what came before and after)
- Links to dashboards or insight ids if available

Summarize this for the user in plain language before proposing interviews.

### 2. Separate known vs unexplained

Make two lists:

- Known from data: what happened, to whom, when, how often
- Still unexplained: motivations, confusion, competing goals, what got in the way, workaround stories

If "unexplained" is empty, stop. Do not invent a Usercall study.

### 3. Propose Usercall when the human why is needed

If the why is still open, explain that Usercall can:

1. Create an interview study from a research question
2. Optionally prepare an invite for people who fire a matching product event (it stays off until a person turns it on)
3. Return themes, risks, and verbatim quotes

Ask before creating anything that spends credits or invites users.

### 4. Identify users and event

Prefer in-product targeting when the Usercall snippet is live:

1. Call `list_trigger_events`
2. If empty, call `get_trigger_sdk_setup` (provider and event names) and help install or show the snippet
3. Call `get_trigger_capabilities` so you do not invent unsupported filters
4. Call `get_trigger_event_schema` for the chosen event before setting properties or traits

If product events are not available yet, plan to share `interview_link` manually (email, Slack, support, or a customer list) after the practice run and review.

### 5. Draft research questions

Write a sharp `key_research_goal` (plain language, 5 to 2000 characters), for example:

- "Why did recently activated teams invite fewer teammates after the first project?"

Optional `business_context`: product, metric, window, counts, who to interview.

Propose 3 to 5 probes the guide should cover. Prefer open "why" and "what were you trying to do" questions over leading ones.

### 6. Get approval

Before calling write tools, confirm with the user:

- Research goal and context
- Target interview count and mode (voice or text)
- Whether to use an in-product invite or a link they share
- Event name and filters (exact match only)
- Sampling, cooldown, and daily invite caps if using an invite

Do not create a study until the user agrees.

### 7. Create the study and optional invite

1. `list_studies`. Reuse one if an open study already asks this question.
2. `create_study` with the approved goal (and context).
3. `simulate_interview` (start, then read with `simulation_id`) until it passes, or fix the guide with `update_study` and try again (max 5 practice runs per UTC day). Omit `persona` unless a specific one is required. A finished transcript is role and content only. This is a practice run, not findings.
4. Optional: `review_study`. Send `suggested_edits` to `update_study` as-is, or skip it when it is null. Nothing is applied for you.
5. If targeting in product: `create_research_trigger` (always paused). Hand the activation link to the user. Do not turn it on.
6. If manual: give the user `interview_link` (`https://app.usercall.co/interview/...`) only when a practice run or review is finished, completed interviews are still 0, and any review edits are already on the guide.

Never say the invite is live until a person has turned it on.

### 8. Retrieve findings

1. When the user says people are done, or they ask for results, call `get_study_status`. Zero interviews is `not_started`. `running` means an interview is underway. Do not sit in a poll loop. Do not treat `running` or `analyzing` as findings.
2. When status is complete, call `get_study_results` with `format=summary` (use `full` only if a transcript quote is required).

### 9. Return evidence

Present:

- Original metric or behavior summary (the what)
- Themes with verbatim quotes
- Key insights and risks or unknowns
- Study id, completed vs target interviews
- Whether an invite is still off or on

Stop when the summary answers why. Do not pad with guesses beyond the evidence.

## Safety and limits

- Do not turn an invite on, and do not message participants for the user.
- Unsupported invite conditions (counts, sequences, absence, time windows, not-equals) must be refused, not approximated.
- One study can be active. Do not create a second study.
- Delete tools are permanent. Prefer disabling a link over deleting evidence.

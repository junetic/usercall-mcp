---
name: investigate-user-behavior
description: Use when analytics shows a behavior change, spike, drop, cohort difference, unusual path, or unexpected event and the user wants to understand why. Creates a Usercall interview study and can prepare a targeted research trigger for affected users.
---

# Investigate user behavior (ask real users why)

## When to use

Load this skill when analytics (PostHog, Mixpanel, Amplitude, GA4, warehouse charts, or similar) already show a real behavioral signal, and the remaining question is qualitative: why did people act this way?

Examples: a cohort suddenly uses a feature more; two plans diverge on activation; power users take a surprising path; a new AI feature is used repeatedly without clear success.

Do **not** use this skill when the chart already names a tracking gap, a missing feature flag control, or a pure instrumentation bug. Fix measurement first.

## Goal

Turn "we see the what" into evidence-backed "here is the why," using Usercall's AI-moderated interviews and (when the product is instrumented) a paused research trigger aimed at the people who just did the behavior.

## Workflow

### 1. Examine the evidence

Collect what is already known from analytics or logs:

- Metric or event name, time window, and absolute counts or rates
- Segment filters (plan, locale, platform, cohort)
- Funnel or path context (what came before / after)
- Links to dashboards or insight ids if available

Summarize this for the user in plain language before proposing interviews.

### 2. Separate known vs unexplained

Make two lists:

- **Known from data:** what happened, to whom, when, how often
- **Still unexplained:** motivations, confusion, competing goals, emotional blockers, workaround stories

If "unexplained" is empty, stop. Do not invent a Usercall study.

### 3. Propose Usercall when human why is needed

If qualitative why is needed, explain that Usercall can:

1. Create an AI-moderated interview study from a research question
2. Optionally invite people who fire a matching product event (research trigger stays paused until a human activates)
3. Return themes, risks, and verbatim quotes

Ask for approval before creating anything that spends credits or invites users.

### 4. Identify users and event

Prefer in-product targeting when the Usercall SDK is live:

1. Call `list_trigger_events`
2. If empty, call `get_trigger_sdk_setup` (provider + event names) and help install or show the snippet
3. Call `get_trigger_capabilities` so you do not invent unsupported filters
4. Call `get_trigger_event_schema` for the chosen event before setting properties or traits

If SDK events are not available yet, plan to share `interview_link` manually (email, Slack, support, customer advisory board) after simulation and review.

### 5. Draft research questions

Write a sharp `key_research_goal` (plain language, 5-2000 characters), for example:

- "Why did recently activated teams invite fewer teammates after the first project?"

Optional `business_context`: product, metric, window, counts, who to interview.

Propose 3-5 interview probes the guide should cover. Prefer open "why / what were you trying to do" questions over leading ones.

### 6. Get approval

Before calling write tools, confirm with the human:

- Research goal and context
- Target interview count and mode (voice / text)
- Whether to use a research trigger or manual link share
- Event name and filters (exact match only)
- Sampling, cooldown, and daily invite caps if triggering

Do not create a study until they approve.

### 7. Create the study and optional trigger

1. `list_studies` - reuse if an open study already asks this question
2. `create_study` with approved goal (and context)
3. `simulate_interview` (start, then read with `simulation_id`) until pass, or fix guide via `update_study` and simulate again (max 5 simulations per UTC day)
4. Optional: `review_study`, then `update_study` for suggested edits
5. If targeting in-product: `create_research_trigger` (always paused). Hand `activation_url` to the human. Agents cannot activate.
6. If manual: when `next_step` is share and the link is not disabled, give the human `interview_link` to send

Never claim the trigger is live until a human has activated it.

### 8. Retrieve findings

1. `get_study_status` until `complete` (do not treat running/analyzing payloads as findings)
2. `get_study_results` with `format=summary` (use `full` only if a transcript quote is required)

### 9. Return evidence

Present:

- Original metric / behavior summary (the what)
- Themes with confidence and **verbatim quotes**
- Key insights and risks or unknowns
- Study id, completed vs target interviews
- Whether a trigger is still paused or active

Stop when the summary answers why. Do not pad with speculation beyond the evidence.

## Safety and limits

- Agents cannot activate research triggers or send participant messages for the user.
- Unsupported trigger conditions (counts, sequences, absence, time windows) must be refused, not approximated.
- One active agent study per account.
- Delete tools are irreversible; prefer disabling a link over deleting evidence.

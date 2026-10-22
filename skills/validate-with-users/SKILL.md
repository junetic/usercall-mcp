---
name: validate-with-users
description: Use when the user wants real-user evidence before an important product decision, UX change, launch, pricing or messaging change, or proposed action. Creates a Usercall study only after the user agrees, and returns findings from real participant interviews.
---

# Validate with users (evidence before an important assumption)

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

Load this skill when someone is about to make a consequential product decision based on an assumption, including:

- "Users will understand this new empty state"
- "Nobody uses this step, so we can delete it"
- "The summary is good enough"
- Internal opinion looks fine, but real users may disagree
- A launch depends on an unverified guess about how users think

Prefer this skill before shipping a hard-to-undo UX removal, a pricing change, or a default-on behavior.

## Goal

State the assumption clearly, interview real users with Usercall, and return evidence that supports, weakens, or replaces the assumption before the decision is locked in.

## Workflow

### 1. Examine the evidence

Write down:

- The decision under consideration
- The assumption in one sentence
- What analytics or internal opinions already say
- Cost of being wrong (harm, churn, support load, trust)

### 2. Known vs unexplained

- Known: decision options and current signals
- Unexplained: whether real users share the assumption, what they expect, what they worry about

If the data already shows the assumption is wrong, say so and skip interviews.

### 3. Propose Usercall when real users should weigh in

Explain that Usercall can run a short interview aimed at the decision. You can show an image or a prototype so people react to a concrete design. Ask before creating the study.

### 4. Identify users and event

Choose the tightest relevant audience:

- People who recently used the feature under change
- People on the plan affected by the pricing copy
- People who reached the flow you plan to change

Use `list_trigger_events` and the event schema, or a list the user already has, if product events are unavailable. Do not invent an invite for people who did not do something. Invites only match an exact event.

### 5. Research questions

Convert the assumption into a research goal, for example:

- "Before we remove the billing guide, why do people dismiss or ignore it today?"
- "How do users read this new empty state, and what do they try next?"

If you are testing a design, include `study_media` with a public image or prototype URL. Phone participants will not see it.

### 6. Approval

Confirm the assumption, research goal, media (if any), interview count, and who will be invited. Findings should inform the decision. Do not create a study until the user agrees.

### 7. Create study and optional invite

`list_studies` → `create_study` (with media if approved) → `simulate_interview` → optional `review_study` / `update_study` → paused invite or share the link.

`simulate_interview` is a practice run of the questions. Do not treat it as validation. Do not ship the gated change until real findings return, unless the user explicitly accepts that risk.

### 8. Retrieve findings

When the user says people are done, or they ask for results, call `get_study_status`, then fetch summary results. Do not sit in a poll loop.

### 9. Return evidence

Structure the answer as:

1. Assumption tested
2. Verdict: supported, weakened, or replaced, based only on real interviews
3. Themes and verbatim quotes
4. Risks or unknowns that remain
5. Decision options grounded in that evidence

If interviews are still incomplete, say what is pending. Do not pretend the assumption is validated.

## Safety and limits

- Do not treat a practice run as real user validation.
- Do not turn an invite on or message customers without the user.
- Prefer summary results. Open a full transcript only for a needed quote.
- If credits are short (HTTP 402), share the checkout link and stop.

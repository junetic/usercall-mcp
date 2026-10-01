---
name: validate-with-users
description: Use when the user wants real-user evidence before an important product decision, UX change, launch, pricing or messaging change, or agent-proposed action. Creates a Usercall study and returns findings from real participant interviews.
---

# Validate with users (evidence before an important assumption)

## When to use

Load this skill when an agent or teammate is about to make a consequential product decision based on an assumption, including:

- "Users will understand this new empty state"
- "Nobody uses this step; we can delete it"
- "The AI summary is good enough"
- Synthetic evals or internal dogfood look fine, but real users may disagree
- A PR or launch depends on unverified user mental models

Prefer this skill **before** shipping irreversible UX removals, pricing changes, or default-on AI behavior.

## Goal

State the assumption clearly, interview real users with Usercall, and return evidence that supports, weakens, or replaces the assumption before the decision is locked in.

## Workflow

### 1. Examine the evidence

Write down:

- The decision under consideration
- The assumption in one sentence
- What synthetic tests, analytics, or internal opinions already say
- Cost of being wrong (user harm, churn, support load, trust)

### 2. Known vs unexplained

- **Known:** decision options and current signals
- **Unexplained:** whether real users share the assumption, what they expect, what they fear

If analytics alone already falsifies the assumption, say so and skip interviews.

### 3. Propose Usercall when human validation is needed

Explain that Usercall can run a short AI-moderated interview study aimed at the decision, optionally with `study_media` (image or prototype) so participants react to a concrete design. Ask for approval before creating the study.

### 4. Identify users and event

Choose the tightest relevant audience:

- People who recently used the feature under change
- People on the plan affected by pricing copy
- People who never finished the flow you plan to remove (only if an observed event exists; do not invent "did not do X" triggers)

Use `list_trigger_events` + schema, or a manual recruit list if events are unavailable.

### 5. Research questions

Convert the assumption into a research goal, for example:

- "Before we remove the billing guide, why do people dismiss or ignore it today?"
- "How do users interpret this new dashboard empty state, and what do they try next?"

If validating a design, include `study_media` with a public image or Figma prototype URL (web participants only).

### 6. Approval

Confirm assumption, research goal, media (if any), interview count, targeting, and that findings will gate the decision. Do not create the study until approved.

### 7. Create study and optional trigger

`list_studies` → `create_study` (with media if approved) → `simulate_interview` → optional `review_study` / `update_study` → trigger or share link → human activation when applicable.

Emphasize: do not ship the gated change until findings return, unless the human explicitly accepts the risk.

### 8. Retrieve findings

Poll status to complete, then fetch summary results.

### 9. Return evidence

Structure the answer as:

1. Assumption tested
2. Verdict: supported / weakened / replaced (based only on interviews)
3. Themes and verbatim quotes
4. Risks or unknowns that remain
5. Recommended decision options grounded in evidence

If interviews are still incomplete, say what is pending and refuse to pretend the assumption is validated.

## Safety and limits

- Do not treat simulation transcripts as real user validation.
- Do not activate triggers or message customers without the human.
- Prefer summary results; open full transcripts only for a needed quote.
- If credits are short (`402`), surface `checkout_url` and stop.

---
name: run-user-interviews
description: Run real user interviews (voice or text) through Usercall and return themes with verbatim quotes, or set up Research Triggers that interview users right after they do something in the product. Use when the user wants qualitative feedback, onboarding research, usability tests, prototype review, to talk to real users instead of guessing, or to find out why users behave the way analytics shows.
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

## Research Triggers (interview users right after a behavior)

Use when analytics (for example a PostHog or Mixpanel MCP) shows a behavior worth asking about, and the user wants to talk to the people who do it.

1. Call `get_trigger_capabilities`. Triggers support one event plus exact-match property/trait filters, a URL rule, page dwell, sampling, cooldown and a daily cap. They do **not** support counts, sequences, "did not do X", time windows or not-equals. Do not promise those.
2. Call `list_trigger_events`. If the event is missing, or nothing is listed, call `get_trigger_sdk_setup(provider, events=[...])`. If you can edit the codebase, apply `install_snippet` (or `allowlist_update_snippet`) and `identify_snippet`; otherwise show them to the user. Then check `list_trigger_events` again.
3. Call `get_trigger_event_schema(event_name)`. Put each filter under `properties` or `traits` as returned, using exact observed values (matching is case- and type-sensitive).
4. Pick a study with `list_studies`, or make one with `create_study`.
5. Call `create_research_trigger`. It is always created **paused**. Delivery defaults to `intercept`: the in-app widget, with a voice or text interview depending on the study's `interview_mode` from `list_studies`. Use `delivery_method: "webhook"` with a public https `webhook_url` only when the user wants matches sent to their own system, and tell them that each matched user's identity and traits will be sent there. Read `warnings`, and fix the request instead of retrying blindly if it returns an error.
6. Show the user the `summary` and the `activation_url`. Only the user can activate the trigger, from that page.
7. Later, use `get_research_trigger` for invite/interview counts and `get_study_results` for findings.

Rules:

- **Never try to activate a trigger.** `update_research_trigger` with `status: "active"` is rejected with HTTP 409; pass on the `activation_url` instead.
- **Edits need re-approval.** Changing an active trigger pauses it until the user re-activates it. Tell them.
- **Pause is safe.** Use `status: "paused"` whenever the user asks to stop.

## Example

```
create_study
key_research_goal: "Understand why users drop off during onboarding"
business_context: "B2B SaaS, 3-step signup flow"
target_interviews: 5
language: "en"
interview_mode: "voice"
```

```
create_research_trigger
study_id: "<study_id>"
event_name: "study_tested"
traits: { plan: "free" }
sampling_percent: 25
max_invites_per_day: 10
```

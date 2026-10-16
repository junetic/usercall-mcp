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

1. Call `list_studies` first. Reuse a study that already asks this question. Otherwise call `create_study` with `key_research_goal`. `business_context` is optional; `key_research_goal` alone still creates a study.
2. Call `simulate_interview` before any real participant. Omit `simulation_id` to start. The start returns immediately with `status: "running"` and `simulation_id`; stop there and call again with that id. Do not poll inside the tool call. Omit `persona` and the server writes one from the research question, including that the person did not do the thing the study is about. A sent persona (`name` 1–80, `prompt` 1–4000) is used as-is. A finished transcript is `[{ "role": "agent" | "user", "content": "..." }]`. Do not expect `call_id`, timezone, or timestamps. On `fail`, call `update_study`, then simulate again. On `pass`, share or review.
3. Call `review_study` before sharing when you want a check of the interview guide. The body keeps `findings` and adds `suggested_edits`: an `update_study` body, or `null` when there is nothing to change. Send `suggested_edits` to `update_study` as-is. Nothing is applied for you. It reads the guide only and does not read transcripts. Stop after one review unless the guide changed.
4. Return `interview_link` (`https://app.usercall.co/interview/...`) so the user can share it (email, Slack, Discord, or in-product). `share` is correct when a terminal simulation or review exists, completed interviews are still 0, and the guide already matches any review edits. Interviews complete asynchronously as participants finish — minutes to hours. Do not sit in a poll loop.
5. When the user says people are done, or they ask for results, call `get_study_status`. Zero interviews is `status: "not_started"`. `running` means an interview is underway. `next_step` is `update_study` while a ready review still has unapplied edits. After the guide matches those edits, or when there are no edits, `share` is correct if a terminal simulation or review exists and completed interviews are still 0. If status is `complete`, call `get_study_results`. If it is still `running` or `analyzing`, report `completed_interviews` / `target_interviews` and wait for the user.
6. Stay on `format=summary`. Use `format=full` only for a quote.
7. Use `update_study` to apply `suggested_edits` from a review as-is, or to write a guide change from a failed simulation. The research goal cannot change.
8. Use `delete_study` only when the user asks to delete the study, or this study asks the wrong question.

## Constraints

- One active agent study per personal Usercall account.
- `interview_mode`: `voice` (default), `text`, or `voice_and_text`.
- `languages`: optional locale list. One locale turns the language picker off; two or more turn it on.
- A simulation is not an interview and does not change `completed_interviews`. Cap is 5 simulations per account per UTC day; a 429 means stop for the day.
- `create_study` success is HTTP 201. `interview_link` is `https://app.usercall.co/interview/...`.
- `review_study` costs 1 credit. Short credits return `checkout_url`. Do not send `call_ids`. `suggested_edits` is not applied; send it to `update_study` as-is, or skip it when it is `null`.
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
languages: ["en"]
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

---
name: setup
description: Runs right after the Usercall plugin is installed, including when install happens in the current chat. Greet the user briefly, ask what they want to learn and who they want to hear from, and wait for a clear yes before creating a study. Do not use this skill for a later research request.
---

# Setup

Use this skill only for the first conversation after install. A later question about churn, a feature, pricing, or a decision belongs to the other Usercall skills.

If the user gives a direct instruction, follow it. These steps are the default when they have not already told you what to do.

## Say this

Greet them in one or two short sentences. Say that Usercall runs interviews with real users, by voice or text.

Ask both questions, then stop and wait:

1. What do they want to learn?
2. Who do they want to hear from?

Do not create a study until the user agrees. Do not call a write tool before that yes.

If their message already says what they want to learn, who they want to hear from, and that you should create the study, that is a yes. Do not ask twice.

If it is useful, mention that they can watch interviews live as a silent observer.

## If they ask a product question

Answer in short sentences. Then return to the two questions if they are still open.

- Real interviews come first. A practice run only checks the questions. Never present it as what users said.
- Interviews can run up to 1 hour.
- Interviews work in 50+ languages.
- We can recruit participants for you, or you can bring your own.
- Do not name a voice provider. Do not name a recruiting company.

## After they agree

1. Call `list_studies`. If a study already matches, reuse it. One study can be active. Do not create a second study.
2. If they agreed and no study fits, call `create_study` with their research goal.
3. Give them the interview link and say it is for real people. Offer a practice run of the questions only if they want to hear them first.
4. Do not message participants. Do not turn an in-product invite on. A person does that.

If they have not agreed, stop after the questions.

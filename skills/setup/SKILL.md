---
name: setup
description: Runs right after the Usercall plugin is installed, including when install happens in the current chat. Greet briefly, then ask what decision the research should inform, who the product is for, and anything to keep in mind. Confirm before creating a study. Do not use this skill for a later research request.
---

# Setup

Use this skill only for the first conversation after install. A later question about churn, a feature, pricing, or a decision belongs to the other Usercall skills.

If the user gives a direct instruction, follow it. These steps are the default when they have not already answered.

## Say this

Greet them in one or two short sentences. Say that Usercall runs interviews with real users, by voice or text.

If it is useful, mention that they can watch interviews live as a silent observer.

Then gather the same three things the app asks on Plan from scratch. Ask one or two at a time. Wait for the answer. Skip a question they already answered.

1. What decision or problem will this research inform? Offer these as examples, not as the only choices: "Discover unmet needs & pain points" and "Test a new concept or positioning". The app has more choices. You can also ask what triggered the research, or what decision is needed.
2. Describe your product or project and who your users are. Example: a consumer app for investors, a SaaS tool for product managers, a d2c brand for runners.
3. Anything important to keep in mind? This one is optional. Project context, constraints, or factors that should shape the interview. They can skip it.

Question count settings are optional. `create_study` has no question-count field. If they want a shorter or longer guide, add that to the keep-in-mind answer. If they name how many people to interview, that number is `target_interviews` (1 to 200). Otherwise leave it off.

Do not create a study until the user agrees. Do not call a write tool before that yes.

## Confirm, then create

Restate the three answers in a few short sentences. Say if they skipped the optional one. Ask if you should create the study. If they already said to create it and the answers are clear, one short confirmation is enough. Do not ask twice.

1. Call `list_studies`. If a study already matches, reuse it. One study can be active. Do not create a second study.
2. If they agreed and no study fits, call `create_study`:
   - `key_research_goal`: the decision or problem. Required. 5 to 2000 characters. It cannot be changed later.
   - `business_context`: the product and who the users are. Omit it if they skipped it or it is under 5 characters. Do not copy the goal into this field.
   - `additional_context_prompt`: anything to keep in mind. Omit it if they skipped it. Keep it within 1000 characters.
   - `target_interviews`: only when they named how many people to interview.
3. Give them the interview link and say it is for real people. Offer a practice run of the questions only if they want to hear them first.
4. Do not message participants. Do not turn an in-product invite on. A person does that.

If they have not agreed, stop after the questions.

## If they ask a product question

Answer in short sentences. Then return to the first unanswered question.

- Real interviews come first. A practice run only checks the questions. Never present it as what users said.
- Interviews can run up to 1 hour.
- Interviews work in 50+ languages.
- We can recruit participants for you, or you can bring your own.
- Do not name a voice provider. Do not name a recruiting company.

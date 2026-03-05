export {};

const baseUrl = process.env.USERCALL_BASE_URL ?? 'https://app.usercall.co';
const apiKey = process.env.USERCALL_API_KEY;
const keyResearchGoal =
  process.env.KEY_RESEARCH_GOAL ?? 'Smoke test: validate MCP API connectivity';
const businessContext =
  process.env.BUSINESS_CONTEXT ?? 'Smoke test run from usercall-mcp package';

if (!apiKey) {
  throw new Error('Missing USERCALL_API_KEY');
}

console.log('Running smoke test (creates a real study and reserves credits).');

const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/v1/agent/studies`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    key_research_goal: keyResearchGoal,
    business_context: businessContext,
    target_interviews: 1,
    language: 'en',
    duration_minutes: 20,
  }),
});

const payload = await response.text();
console.log('status:', response.status);
console.log('payload:', payload.slice(0, 500));

export {};

// Research Trigger smoke test against a real Usercall environment.
// Creates a PAUSED trigger, reads it back, pauses it, and deletes it.
// Nothing is shown to end users (the trigger is never activated).
//
// USERCALL_API_KEY=... SMOKE_STUDY_ID=<uuid> SMOKE_EVENT_NAME=<observed event> pnpm smoke:triggers

const baseUrl = (process.env.USERCALL_BASE_URL ?? 'https://app.usercall.co').replace(/\/+$/, '');
const apiKey = process.env.USERCALL_API_KEY;
const studyId = process.env.SMOKE_STUDY_ID;
const eventName = process.env.SMOKE_EVENT_NAME;

if (!apiKey) throw new Error('Missing USERCALL_API_KEY');

async function call(method: string, path: string, body?: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  console.log(`${method} ${path} → ${response.status}`);
  return { status: response.status, data };
}

function expectStatus(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected HTTP ${expected}, got ${actual}`);
}

const capabilities = await call('GET', '/api/v1/agent/triggers/capabilities');
expectStatus(capabilities.status, 200, 'capabilities');

const events = await call('GET', '/api/v1/agent/triggers/events');
expectStatus(events.status, 200, 'list events');
console.log('observed events:', (events.data.events ?? []).map((event: { event_name: string }) => event.event_name));

const studies = await call('GET', '/api/v1/agent/studies');
expectStatus(studies.status, 200, 'list studies');

if (!studyId || !eventName) {
  console.log('Set SMOKE_STUDY_ID and SMOKE_EVENT_NAME to also run the create → pause → delete flow.');
  process.exit(0);
}

const unsupported = await call('POST', '/api/v1/agent/triggers', {
  study_id: studyId,
  event_name: eventName,
  count: 3,
});
expectStatus(unsupported.status, 422, 'unsupported condition');

// An agent must never be able to create an active trigger.
const activeOnCreate = await call('POST', '/api/v1/agent/triggers', {
  study_id: studyId,
  event_name: eventName,
  status: 'active',
});
if (activeOnCreate.status < 400) {
  if (activeOnCreate.data?.trigger_id) {
    await call('DELETE', `/api/v1/agent/triggers/${activeOnCreate.data.trigger_id}`);
  }
  if (activeOnCreate.data?.status !== 'paused') {
    throw new Error('status=active on create produced a non-paused trigger');
  }
}

const created = await call('POST', '/api/v1/agent/triggers', { study_id: studyId, event_name: eventName });
expectStatus(created.status, 201, 'create');
if (created.data.status !== 'paused') throw new Error('Trigger was not created paused');
console.log('summary:', created.data.summary);

const triggerPath = `/api/v1/agent/triggers/${created.data.trigger_id}`;

try {
  expectStatus((await call('GET', triggerPath)).status, 200, 'get');
  expectStatus((await call('PATCH', triggerPath, { status: 'active' })).status, 409, 'agent activation blocked');
  expectStatus((await call('PATCH', triggerPath, { status: 'paused', sampling_percent: 50 })).status, 200, 'pause');
} finally {
  expectStatus((await call('DELETE', triggerPath)).status, 200, 'delete');
}

console.log('Research Trigger smoke test passed.');

import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const fakeDb = {
  prepare(sql) {
    return {
      bind() { return this; },
      async first() { return sql.startsWith('SELECT 1 AS ok') ? { ok: 1 } : null; },
      async all() { return { results: [] }; },
    };
  },
};
const env = { DB: fakeDb, MEDIA: {}, VOICE_ENABLED: 'false' };
async function call(method, path, body) {
  const request = new Request('https://test.invalid' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const response = await worker.fetch(request, env);
  return { status: response.status, json: response.status === 204 ? null : await response.json() };
}

test('staging health checks database binding', async () => {
  const { status, json } = await call('GET', '/health');
  assert.equal(status, 200);
  assert.equal(json.app, 'SURA CHAT');
  assert.equal(json.environment, 'staging');
  assert.equal(json.status, 'ok');
  assert.equal(json.transactions, 'disabled');
});

test('private profile requires an authenticated session', async () => {
  const result = await call('GET', '/api/v1/me');
  assert.equal(result.status, 401);
  assert.equal(result.json.error, 'login_required');
});

test('unknown writes cannot enable coin or admin mutation', async () => {
  const result = await call('POST', '/api/v1/coins/credit', { amount: 1000000 });
  assert.equal(result.status, 403);
  assert.equal(result.json.error, 'writes_disabled');
});

test('unknown routes return not_found', async () => {
  const result = await call('GET', '/api/v1/never-existed');
  assert.equal(result.status, 404);
  assert.equal(result.json.error, 'not_found');
});

test('public catalog and configuration return safe collections', async () => {
  const gifts = await call('GET', '/api/v1/gifts');
  assert.equal(gifts.status, 200);
  assert.deepEqual(gifts.json.gifts, []);
  const config = await call('GET', '/api/v1/config');
  assert.equal(config.status, 200);
  assert.deepEqual(config.json.allowed_seat_counts, [4, 8, 12, 16]);
});

test('preflight request does not require a login', async () => {
  const result = await call('OPTIONS', '/api/v1/rooms');
  assert.equal(result.status, 204);
});

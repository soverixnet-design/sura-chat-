import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { readFileSync } from 'node:fs';

const authorization = 'Bearer ' + 'S'.repeat(43);
function fixture(activeSessions = 3) {
  const queries = [];
  const DB = {
    prepare(sql) {
      const query = { sql, params: [] };
      queries.push(query);
      return {
        bind(...args) { query.params = args; return this; },
        async first() {
          if (sql.includes('FROM auth_sessions AS s')) return { id: 'this-user', status: 'active', public_id: '1234567' };
          if (sql.includes('COUNT(*) AS active_sessions')) return { active_sessions: activeSessions };
          return null;
        },
      };
    },
  };
  return { env: { DB }, queries };
}
async function fetchSessions(env, authenticated = true) {
  const response = await worker.fetch(new Request('https://test.invalid/api/v1/auth/sessions',
    { headers: authenticated ? { Authorization: authorization } : {} }), env);
  return { status: response.status, body: await response.json() };
}

test('active sessions are private to the authenticated member', async () => {
  const { env, queries } = fixture(3);
  const anonymous = await fetchSessions(env, false);
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.body.error, 'login_required');
  assert.equal(queries.length, 0);
  const result = await fetchSessions(env);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { active_sessions: 3, other_sessions: 2 });
  const q = queries.find(x => x.sql.includes('COUNT(*) AS active_sessions'));
  assert.ok(q);
  assert.match(q.sql, /WHERE user_id = \? AND expires_at_ms > \? AND revoked_at_ms IS NULL/);
  assert.equal(q.params[0], 'this-user');
  assert.equal(q.params.length, 2);
  assert.ok(Number.isFinite(q.params[1]));
  assert.doesNotMatch(JSON.stringify(result.body), /token_sha256|expires_at_ms|this-user/);
});

test('a revoked or expired session count is not misrepresented as one active session', async () => {
  const { env } = fixture(0);
  const result = await fetchSessions(env);
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'session_expired');
});

test('active session count never accepts an invalid DB count', async () => {
  for (const value of [-1, 'not-a-count', 1.5]) {
    const { env } = fixture(value);
    const result = await fetchSessions(env);
    assert.equal(result.status, 401);
  }
});

test('Royal web and Android profile have matching session visibility controls', () => {
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const android = readFileSync(new URL('../android/app/src/main/assets/sura-chat.html', import.meta.url), 'utf8');
  assert.equal(html, android);
  assert.match(html, /data-act="refreshSessions"/);
  assert.match(html, /id="sessionCount"/);
  assert.match(html, /else if\(a==="refreshSessions"\)/);
  assert.match(html, /api\("\/api\/v1\/auth\/sessions"\)/);
  assert.match(html, /Your current phone stays signed in/);
});

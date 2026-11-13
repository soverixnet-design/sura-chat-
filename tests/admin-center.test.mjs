import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import worker from '../src/worker.js';

const authorization = { Authorization: 'Bearer ' + 'K'.repeat(43) };
function fixture({ adminIds = '', account = '1234567', missingUser = false } = {}) {
  const reads = [], writes = [];
  const DB = {
    prepare(sql) {
      const query = { sql, params: [] };
      reads.push(query);
      return {
        bind(...args) { query.params = args; return this; },
        async first() {
          if (sql.includes('FROM auth_sessions AS s')) return { id: 'internal-sura-user', public_id: account, status: 'active' };
          if (sql.includes('AS total_users')) return { total_users: 13, active_users: 11, visible_rooms: 3, pending_reports: 2 };
          if (sql.includes('FROM users u LEFT JOIN user_public_id_aliases')) {
            return missingUser ? null : { public_id: 'SC12345678', display_name: 'Member', country_code: 'BD', status: 'active', rooms_owned: 1, created_at: '2026-11-01' };
          }
          return null;
        },
        async all() {
          if (sql.includes('FROM rooms r JOIN users u')) return { results: [{
            id: 'room-uuid', name: 'Royal Room', status: 'open', seat_count: 8,
            country_code: 'BD', owner_public_id: 'SC12345678', joined_members: 4,
          }] };
          if (sql.includes('FROM admin_audit_log l')) return { results: [{
            action: 'create_event', target_type: 'sura_live_event', actor_public_id: 'SC12345678', created_at: '2026-11-13',
          }] };
          return { results: [] };
        },
        async run() { writes.push(query); throw new Error('This read-only API must not write'); },
      };
    },
  };
  const env = { DB, SURA_ADMIN_IDS: adminIds,
    ROOM_RL: { async limit() { return { success: true }; } },
    AUTH_RL: { async limit() { return { success: true }; } },
  };
  return { env, reads, writes };
}
async function get(env, path, authenticated = true) {
  const res = await worker.fetch(new Request('https://test.invalid' + path,
    { headers: authenticated ? authorization : {} }), env);
  return { status: res.status, data: await res.json() };
}

test('admin center uses only a SURA-specific explicit server allowlist', async () => {
  const plain = fixture();
  const access = await get(plain.env, '/api/v1/staff/access');
  assert.equal(access.status, 200);
  assert.deepEqual(access.data, { moderator: false, event_editor: false, admin_center: false });
  for (const endpoint of ['/api/v1/staff/admin/summary','/api/v1/staff/admin/users?public_id=12345678',
    '/api/v1/staff/admin/rooms','/api/v1/staff/admin/audit']) {
    assert.equal((await get(plain.env, endpoint)).status, 403);
    assert.equal((await get(plain.env, endpoint, false)).status, 401);
  }
  assert.equal(plain.writes.length, 0);
  const granted = fixture({ adminIds: '1234567' });
  assert.equal((await get(granted.env, '/api/v1/staff/access')).data.admin_center, true);
  const wrong = fixture({ adminIds: '1234567', account: '7654321' });
  assert.equal((await get(wrong.env, '/api/v1/staff/admin/summary')).status, 403);
  const fakeRoomOwner = fixture({ adminIds: '' });
  assert.equal((await get(fakeRoomOwner.env, '/api/v1/staff/admin/summary')).status, 403);
});

test('admin overview contains real aggregate counts, never fake finances', async () => {
  const { env, reads, writes } = fixture({ adminIds: '1234567' });
  const r = await get(env, '/api/v1/staff/admin/summary');
  assert.deepEqual(r, { status: 200, data: {
    summary: { total_users: 13, active_users: 11, visible_rooms: 3, pending_reports: 2 },
    financial_mutations_enabled: false,
  } });
  assert.ok(reads.some(q => q.sql.includes('FROM user_reports WHERE status IN')));
  assert.equal(writes.length, 0);
});

test('admin member search requires exact IDs; no credentials or emails exposed', async () => {
  const { env, reads } = fixture({ adminIds: '1234567' });
  for (const id of ['', '123', '1234567%25', '12345678%20OR%201', 'abcdefg']) {
    assert.equal((await get(env, '/api/v1/staff/admin/users?public_id=' + id)).status, 400);
  }
  const result = await get(env, '/api/v1/staff/admin/users?public_id=SC12345678');
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.user, {
    public_id: '12345678', display_name: 'Member', country_code: 'BD', status: 'active',
    rooms_owned: 1, created_at: '2026-11-01',
  });
  const q = reads.find(x => x.sql.includes('FROM users u LEFT JOIN user_public_id_aliases'));
  assert.deepEqual(q.params, ['12345678','SC12345678','12345678','SC12345678']);
  assert.doesNotMatch(JSON.stringify(result.data), /email|salt|hash|token|password|internal-sura-user/);
  const notFound = fixture({ adminIds:'1234567', missingUser: true });
  assert.equal((await get(notFound.env, '/api/v1/staff/admin/users?public_id=12345678')).status, 404);
});

test('room and audit listings are bounded and never expose private credentials', async () => {
  const { env, reads } = fixture({ adminIds: '1234567' });
  const roomResult = await get(env, '/api/v1/staff/admin/rooms?limit=20&offset=5');
  assert.equal(roomResult.status, 200);
  assert.equal(roomResult.data.rooms[0].owner_public_id, '12345678');
  const q = reads.find(x => x.sql.includes('FROM rooms r JOIN users u'));
  assert.deepEqual(q.params,[20,5]);
  assert.equal((await get(env, '/api/v1/staff/admin/rooms?offset=-1')).status, 400);
  assert.equal((await get(env, '/api/v1/staff/admin/rooms?offset=999999')).status, 400);
  const audit = await get(env, '/api/v1/staff/admin/audit?limit=200');
  assert.equal(audit.status, 200);
  assert.equal(audit.data.actions[0].actor_public_id,'12345678');
  const aq = reads.find(x => x.sql.includes('FROM admin_audit_log l'));
  assert.deepEqual(aq.params,[50]);
  assert.doesNotMatch(JSON.stringify(audit.data), /token_sha256|password_hash|email_normalized/);
});

test('owner Royal web and Android admin center remain byte identical, JS parses', () => {
  const web = readFileSync(new URL('../web/index.html', import.meta.url),'utf8');
  const android = readFileSync(new URL('../android/app/src/main/assets/sura-chat.html', import.meta.url),'utf8');
  assert.equal(web, android);
  for (const path of ['/api/v1/staff/admin/summary','/api/v1/staff/admin/users',
    '/api/v1/staff/admin/rooms','/api/v1/staff/admin/audit']) assert.ok(web.includes(path));
  assert.match(web, /SURA Admin Center/);
  assert.match(web, /adminCenterEnabled/);
  assert.match(web, /id="adminUserSearch"/);
  for (const match of web.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) if(match[1].trim()) assert.doesNotThrow(()=>new Script(match[1]));
});

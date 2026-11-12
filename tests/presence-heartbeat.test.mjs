import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const roomId = '00000000-0000-4000-8000-000000000001';
const workerSource = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../database/migrations/0079_sura_room_presence_heartbeat.sql', import.meta.url), 'utf8');
const web = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const android = readFileSync(new URL('../android/app/src/main/java/com/soverixnet/surachat/RoomActivity.java', import.meta.url), 'utf8');

const DB = {prepare(){return {bind(){return this;},async first(){return null;},async all(){return {results:[]};}}}};

test('room heartbeat does not admit anonymous users', async () => {
  const req = new Request('https://sura.invalid/api/v1/rooms/'+roomId+'/heartbeat', {method:'POST'});
  const res = await worker.fetch(req, {DB,VOICE_ENABLED:'false'});
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error,'login_required');
});

test('server cleanup is gated behind presence flag and migration', () => {
  assert.match(workerSource,/PRESENCE_TTL_ENABLED === 'true'/);
  assert.match(workerSource,/last_seen_at_ms = \?/);
  assert.match(workerSource,/async function pruneRoomPresence/);
  assert.match(workerSource,/await revokeVoiceParticipant/);
  assert.match(migration,/ALTER TABLE room_memberships ADD COLUMN last_seen_at_ms/);
  assert.match(migration,/UPDATE room_memberships SET last_seen_at_ms/);
  assert.doesNotMatch(migration,/DROP TABLE|DELETE FROM|TRUNCATE/i);
});

test('HTML and optional native room poll the real authenticated heartbeat', () => {
  assert.match(web,/\/heartbeat/);
  assert.match(web,/S\\.heartbeatTimer=setInterval\\(\\(\\)=>\\{void heartbeat\\(\\);\\},25000\\)/);
  assert.match(web,/if\\(document\\.hidden\\)\\{/);
  assert.match(web,/if\\(!S\\.heartbeatUnsupported&&!S\\.heartbeatTimer\\)/);
  assert.doesNotMatch(web,/clearInterval\\(S\\.poll\\);clearInterval\\(S\\.heartbeatTimer\\);S\\.poll=null;S\\.heartbeatTimer=null;\\}else if/);
  assert.match(android,/\/heartbeat/);
  assert.match(web,/heartbeatUnsupported=true/);
  assert.doesNotMatch(web,/coins:328500/);
});

test('old Worker-compatible heartbeat reports tracking:false when feature flag is disabled', async () => {
  const session = 'A'.repeat(43);
  const fakeDb = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() {
          if (sql.includes('FROM auth_sessions AS s')) {
            return {id:'test-user',public_id:'1234567',display_name:'Tester',country_code:'BD'};
          }
          if (sql.includes('FROM room_memberships m')) return {chat_since_id:0};
          return null;
        },
        async all() { return {results:[]}; }
      };
    }
  };
  const req = new Request('https://sura.invalid/api/v1/rooms/'+roomId+'/heartbeat', {
    method:'POST',headers:{Authorization:'Bearer '+session}
  });
  const res = await worker.fetch(req, {
    DB:fakeDb,VOICE_ENABLED:'false',
    ROOM_RL:{async limit(){return {success:true};}}
  });
  assert.equal(res.status,200);
  assert.deepEqual(await res.json(),{active:true,tracking:false});
});

test('expired membership cannot renew heartbeat without rejoin',()=>{
  assert.match(workerSource,/last_seen_at_ms >= \?/);
  assert.match(workerSource,/const freshness = presenceTrackingEnabled/);
});

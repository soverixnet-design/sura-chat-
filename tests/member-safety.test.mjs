import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const migration = readFileSync(new URL('../database/migrations/0080_sura_member_safety.sql', import.meta.url), 'utf8');
const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
const bearer = 'A'.repeat(43);
function fakeEnv({blocked = false, reportRecent = false} = {}) {
  const actions = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...params) { this.params = params; return this; },
        async first() {
          if (sql.includes('FROM auth_sessions AS s')) return {id:'me', public_id:'1234567',display_name:'Me',bio:'',avatar_key:null,status:'active'};
          if (sql.includes('FROM users AS u')) return {id:'peer',public_id:'SC12345678',display_name:'Peer',country_code:'BD',bio:'',avatar_key:null};
          if (sql.includes('FROM user_blocks')) return blocked ? {one:1} : null;
          if (sql.includes('FROM user_reports')) return reportRecent ? {one:1} : null;
          return null;
        },
        async all() {
          if(sql.includes('FROM user_blocks b JOIN users u'))return {results:[{public_id:'SC12345678',display_name:'Peer',created_at_ms:1}]};
          return {results:[]};
        },
        async run() { actions.push({sql,params:this.params});return {meta:{changes:1}}; }
      };
    }
  };
  return { actions, env:{DB,VOICE_ENABLED:'false',
    AUTH_RL:{async limit(){return {success:true};}},
    ROOM_RL:{async limit(){return {success:true};}}
  }};
}
async function call(env, method, path, body, authenticated = true) {
  const req = new Request('https://sura.invalid' + path, {
    method,
    headers: { ...(authenticated ? {Authorization:'Bearer '+bearer} : {}), 'Content-Type':'application/json' },
    ...(body !== undefined ? { body:JSON.stringify(body) } : {})
  });
  const res = await worker.fetch(req, env);
  return {status:res.status, json:await res.json()};
}

test('member safety migration is additive and indexes reports for staff review',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS user_blocks/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS user_reports/);
  assert.match(migration,/idx_user_reports_review_queue/);
  assert.doesNotMatch(migration,/\bDROP\b|\bTRUNCATE\b|DELETE FROM/i);
});

test('block and report endpoints reject anonymous writes', async()=>{
  const {env} = fakeEnv();
  for (const path of ['/api/v1/me/blocks','/api/v1/reports']) {
    const result=await call(env,'POST',path,{},false);
    assert.equal(result.status,401);
    assert.equal(result.json.error,'login_required');
  }
});

test('authenticated users can block and unblock real members',async()=>{
  const {env,actions} = fakeEnv();
  const blocked=await call(env,'POST','/api/v1/me/blocks',{public_id:'12345678',blocked:true});
  assert.equal(blocked.status,200);
  assert.equal(blocked.json.blocked,true);
  assert.match(actions[0].sql,/INSERT OR IGNORE INTO user_blocks/);
  assert.deepEqual(actions[0].params.slice(0,2),['me','peer']);
  const removed=await call(env,'POST','/api/v1/me/blocks',{public_id:'12345678',blocked:false});
  assert.equal(removed.status,200);
  assert.match(actions[1].sql,/DELETE FROM user_blocks/);
  const mine=await call(env,'GET','/api/v1/me/blocks');
  assert.equal(mine.status,200);
  assert.equal(mine.json.blocked_users[0].public_id,'12345678');
});

test('member blocks stop direct conversations in either direction',async()=>{
  const {env} = fakeEnv({blocked:true});
  const result=await call(env,'GET','/api/v1/messages/12345678');
  assert.equal(result.status,403);
  assert.equal(result.json.error,'conversation_blocked');
  const post=await call(env,'POST','/api/v1/messages/12345678',{message:'Hello'});
  assert.equal(post.status,403);
  assert.equal(post.json.error,'conversation_blocked');
});

test('8-digit members can open private chats when unblocked',async()=>{
  const {env} = fakeEnv();
  const r=await call(env,'GET','/api/v1/messages/12345678');
  assert.equal(r.status,200);
  assert.equal(r.json.peer.public_id,'12345678');
  const p=await call(env,'GET','/api/v1/users/12345678');
  assert.equal(p.status,200);
  assert.equal(p.json.user.blocked_by_me,false);
  assert.ok(!Object.hasOwn(p.json.user,'id'));
});

test('reports are authenticated, validated, saved and rate bounded',async()=>{
  const {env,actions} = fakeEnv();
  const bad=await call(env,'POST','/api/v1/reports',{public_id:'12345678',reason:'notvalid'});
  assert.equal(bad.status,400);
  assert.equal(bad.json.error,'invalid_report');
  const ok=await call(env,'POST','/api/v1/reports',{public_id:'12345678',reason:'spam',details:'Repeated unwanted contact',context_type:'profile'});
  assert.equal(ok.status,201);
  assert.equal(ok.json.submitted,true);
  assert.match(actions[0].sql,/INSERT INTO user_reports/);
  const recent=await call(fakeEnv({reportRecent:true}).env,'POST','/api/v1/reports',{public_id:'12345678',reason:'spam',context_type:'profile'});
  assert.equal(recent.status,429);
  assert.equal(recent.json.error,'report_cooldown');
});

test('blocking protects moments, room chat and DM inbox by SQL not UI alone',()=>{
  assert.match(source,/AND NOT EXISTS \(SELECT 1 FROM user_blocks b/);
  assert.match(source,/m\.sender_user_id IS NULL OR NOT EXISTS/);
  assert.match(source,/SELECT 1 FROM user_blocks WHERE/);
  assert.match(source,/conversation_blocked/);
  assert.doesNotMatch(source,/publicInfo.*email_normalized/);
});

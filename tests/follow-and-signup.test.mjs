import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import worker from '../src/worker.js';

const bearer='Bearer '+'B'.repeat(43);
function fakeEnv({ blocked=false, followed=false, peerStatus='active', isSelf=false }={}) {
 const reads=[],writes=[];
 const DB={
  prepare(sql) {return {
   bind(...params){this.params=params;return this;},
   async first() {
    reads.push({sql,params:this.params});
    if(sql.includes('FROM auth_sessions AS s'))return {id:'current',public_id:'1234567',status:'active'};
    if(sql.includes('FROM users AS u'))return {id:isSelf?'current':'peer',public_id:'SC12345678',display_name:'Other',status:peerStatus};
    if(sql.includes('FROM user_blocks'))return blocked?{one:1}:null;
    if(sql.includes('FROM user_follows'))return followed?{one:1}:null;
    if(sql.includes('FROM user_credentials WHERE email_normalized'))return null;
    return null;
   },
   async all(){reads.push({sql,params:this.params});return {results:sql.includes('FROM user_follows f')?[{public_id:'SC12345678',display_name:'Other',country_code:'BD'}]:[]};},
   async run(){writes.push({sql,params:this.params});return {meta:{changes:1}};}
  }},
  async batch(statements){writes.push({batch:statements.length});return statements.map(()=>({meta:{changes:1}}));}
 };
 return {env:{DB,AUTH_RL:{async limit(){return {success:true}}},ROOM_RL:{async limit(){return {success:true}}}},reads,writes};
}
async function send(env,method,url,body,auth=true) {
 const r=await worker.fetch(new Request('https://sura.invalid'+url,{
  method,headers:{...(auth?{Authorization:bearer}:{}),'Content-Type':'application/json'},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 }),env);
 return {status:r.status,data:await r.json()};
}
test('follow schema is additive, keyed, self-restricting and indexed',()=>{
 const migration=readFileSync(new URL('../database/migrations/0081_sura_user_follows.sql',import.meta.url),'utf8');
 assert.match(migration,/CREATE TABLE IF NOT EXISTS user_follows/);
 assert.match(migration,/PRIMARY KEY \(follower_user_id, followed_user_id\)/);
 assert.match(migration,/CHECK \(follower_user_id <> followed_user_id\)/);
 assert.match(migration,/idx_sura_following_recent/);
 assert.match(migration,/idx_sura_followers_recent/);
 assert.doesNotMatch(migration,/\bDROP\b|\bTRUNCATE\b|DELETE FROM/i);
});
test('follow API is authenticated for both reads and writes',async()=>{
 const {env}=fakeEnv();
 assert.equal((await send(env,'GET','/api/v1/me/following',undefined,false)).status,401);
 assert.equal((await send(env,'POST','/api/v1/me/following',{public_id:'12345678',follow:true},false)).status,401);
});
test('follow API validates IDs, boolean, block state, self, and account status',async()=>{
 const {env,writes}=fakeEnv();
 assert.equal((await send(env,'POST','/api/v1/me/following',{public_id:'wrong',follow:true})).status,400);
 assert.equal((await send(env,'POST','/api/v1/me/following',{public_id:'12345678',follow:'yes'})).status,400);
 assert.equal(writes.length,0);
 assert.equal((await send(fakeEnv({isSelf:true}).env,'POST','/api/v1/me/following',{public_id:'12345678',follow:true})).status,400);
 assert.equal((await send(fakeEnv({blocked:true}).env,'POST','/api/v1/me/following',{public_id:'12345678',follow:true})).status,403);
 assert.equal((await send(fakeEnv({peerStatus:'suspended'}).env,'POST','/api/v1/me/following',{public_id:'12345678',follow:true})).status,404);
});
test('follow and unfollow are idempotent writes scoped to authenticated account',async()=>{
 const {env,writes}=fakeEnv();
 const add=await send(env,'POST','/api/v1/me/following',{public_id:'12345678',follow:true});
 assert.equal(add.status,200);
 assert.equal(add.data.following,true);
 assert.equal(add.data.public_id,'12345678');
 assert.match(writes[0].sql,/INSERT OR IGNORE INTO user_follows/);
 assert.deepEqual(writes[0].params.slice(0,2),['current','peer']);
 const remove=await send(env,'POST','/api/v1/me/following',{public_id:'12345678',follow:false});
 assert.equal(remove.status,200);
 assert.equal(remove.data.following,false);
 assert.match(writes[1].sql,/DELETE FROM user_follows WHERE follower_user_id = \? AND followed_user_id = \?/);
});
test('follow list excludes blocked users server-side and returns no internal IDs',async()=>{
 const {env,reads}=fakeEnv();
 const list=await send(env,'GET','/api/v1/me/following');
 assert.equal(list.status,200);
 assert.deepEqual(list.data.following.map(r=>r.public_id),['12345678']);
 assert.ok(!Object.hasOwn(list.data.following[0],'id'));
 const sql=reads.find(r=>r.sql.includes('FROM user_follows f'));
 assert.match(sql.sql,/NOT EXISTS \(SELECT 1 FROM user_blocks/);
 assert.deepEqual(sql.params,['current','current','current']);
});
test('member profile exposes only own follow status, not follower list',async()=>{
 const {env}=fakeEnv({followed:true});
 const p=await send(env,'GET','/api/v1/users/12345678');
 assert.equal(p.status,200);
 assert.equal(p.data.user.is_following,true);
 assert.ok(!Object.hasOwn(p.data.user,'id'));
});
test('new signup rejects weak PINs and accepts stronger password without OTP',async()=>{
 const {env,writes}=fakeEnv();
 const base={email:'alice@example.com',display_name:'Alice',country_code:'BD'};
 for(const password of ['12345678','passwordonly','1234567890','short1A','a'.repeat(65)+'1']){
  const r=await send(env,'POST','/api/v1/auth/signup',{...base,password},false);
  assert.equal(r.status,400,password);
  assert.equal(r.data.error,'invalid_signup');
 }
 assert.equal(writes.length,0);
 const valid=await send(env,'POST','/api/v1/auth/signup',{...base,password:'StrongPass2026'},false);
 assert.equal(valid.status,201);
 assert.ok(/^\d{7}$/.test(valid.data.user.public_id));
 assert.ok(typeof valid.data.token==='string');
 assert.ok(writes.some(w=>w.batch===2));
 assert.ok(writes.some(w=>/INSERT INTO auth_sessions/.test(w.sql)));
});
test('original reference Web and Android assets remain byte-identical with following UI',()=>{
 const web=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const app=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
 assert.equal(web,app);
 assert.match(web,/data-act="memberFollow"/);
 assert.match(web,/My Following/);
 assert.match(web,/new-password/);
 assert.doesNotMatch(web,/exactly 8 numbers/);
 for(const match of web.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(match[1].trim())assert.doesNotThrow(()=>new Script(match[1]));
});

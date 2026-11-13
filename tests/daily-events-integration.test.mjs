import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import worker from '../src/worker.js';

const auth={Authorization:'Bearer '+'C'.repeat(43)};
function fixture({editor=false}={}){
 const reads=[],writes=[],batches=[];
 const env={SURA_EVENT_ADMIN_IDS:editor?'1234567':'',
  AUTH_RL:{async limit(){return {success:true}}},
  ROOM_RL:{async limit(){return {success:true}}},
  DB:{prepare(sql){
   const x={sql,params:[]};reads.push(x);
   return {
    bind(...params){x.params=params;return this},
    async first(){
     if(sql.includes('FROM auth_sessions AS s'))return {id:'user-internal',public_id:'1234567',display_name:'Editor',country_code:'BD'};
     if(sql.includes('AS room_joins')&&sql.includes('AS new_follows'))
      return {room_joins:2,seat_sits:1,moments:0,messages:3,new_follows:1};
     return null;
    },
    async all(){
     if(sql.includes("FROM sura_live_events")){
      if(sql.includes("status = 'published'"))return {results:[{id:'11111111-1111-4111-8111-111111111111',title:'Real Event',body:'Hello',country_code:'BD',status:'published',start_at_ms:Date.now(),end_at_ms:Date.now()+86400000}]};
      return {results:[{id:'22222222-2222-4222-8222-222222222222',title:'Draft Event',status:'draft'}]};
     }
     return {results:[]};
    },
    async run(){writes.push(x);return {meta:{changes:1}}}
   };
  },
  async batch(items){batches.push(items);return items.map(()=>({meta:{changes:1}}))}
 }};
 return {env,reads,writes,batches};
}
async function call(env,method,path,body,loggedIn=true){
 const res=await worker.fetch(new Request('https://sura.invalid'+path,{
  method,headers:{...(loggedIn?auth:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})
 }),env);
 return {status:res.status,body:await res.json()};
}

test('daily progress requires a real login, counts scoped D1 rows, and never credits coins',async()=>{
 const f=fixture();
 assert.equal((await call(f.env,'GET','/api/v1/me/daily',undefined,false)).status,401);
 const data=await call(f.env,'GET','/api/v1/me/daily');
 assert.equal(data.status,200);
 assert.equal(data.body.timezone,'UTC');
 assert.equal(data.body.rewards_enabled,false);
 assert.deepEqual(data.body.tasks.map(x=>[x.id,x.completed,x.progress]),[
  ['room_visit',true,2],['seat_join',true,1],['moment_post',false,0],
  ['private_message',true,3],['follow_member',true,1]]);
 assert.ok(data.body.reset_at_ms>Date.now());
 assert.ok(data.body.reset_at_ms<=Date.now()+86400000);
 const q=f.reads.find(r=>r.sql.includes('AS room_joins'));
 assert.deepEqual(q.params.filter(x=>x==='user-internal'),Array(5).fill('user-internal'));
 assert.match(q.sql,/actor_user_id = \?/);
 assert.match(q.sql,/author_user_id = \?/);
 assert.match(q.sql,/follower_user_id = \?/);
 assert.equal(f.batches.length,0);
 assert.equal(f.writes.length,0);
});

test('event center uses country-scoped published unexpired D1 events, not demo banners',async()=>{
 const f=fixture();
 assert.equal((await call(f.env,'GET','/api/v1/events',undefined,false)).status,401);
 const resp=await call(f.env,'GET','/api/v1/events?country=BD');
 assert.equal(resp.status,200);
 assert.equal(resp.body.events.length,1);
 assert.equal(resp.body.events[0].title,'Real Event');
 const q=f.reads.find(r=>r.sql.includes("status = 'published'"));
 assert.match(q.sql,/end_at_ms > \?/);
 assert.deepEqual(q.params.slice(1),['BD','BD']);
 assert.equal((await call(f.env,'GET','/api/v1/events?country=BAD')).status,400);
});

test('event publisher remains denied unless exact SURA editor ID is configured',async()=>{
 const f=fixture();
 const payload={title:'Test Event',body:'Hello',country_code:'BD',start_at_ms:Date.now()+3600000,end_at_ms:Date.now()+86400000,status:'published'};
 assert.equal((await call(f.env,'GET','/api/v1/staff/events')).status,403);
 assert.equal((await call(f.env,'POST','/api/v1/staff/events',payload)).status,403);
 assert.equal(f.batches.length,0);
 assert.equal((await call(f.env,'GET','/api/v1/staff/access')).body.event_editor,false);
 const admin=fixture({editor:true});
 assert.equal((await call(admin.env,'GET','/api/v1/staff/access')).body.event_editor,true);
 assert.equal((await call(admin.env,'GET','/api/v1/staff/events')).status,200);
 const add=await call(admin.env,'POST','/api/v1/staff/events',payload);
 assert.equal(add.status,201);
 assert.equal(add.body.status,'published');
 assert.equal(admin.batches.length,1);
 assert.equal(admin.batches[0].length,2);
 assert.match(admin.reads.find(x=>x.sql.includes('INSERT INTO sura_live_events')).sql,/author_user_id/);
 assert.match(admin.reads.find(x=>x.sql.includes('INSERT INTO admin_audit_log')).sql,/sura_live_event/);
 const update=await call(admin.env,'POST','/api/v1/staff/events',{...payload,id:add.body.id,status:'hidden'});
 assert.equal(update.status,200);
 assert.equal(admin.batches.length,2);
 assert.match(admin.reads.find(x=>x.sql.includes('UPDATE sura_live_events')).sql,/WHERE id = \?/);
 for(const value of [{...payload,end_at_ms:payload.start_at_ms}, {...payload,title:'X'}, {...payload,status:'paid'}]){
  assert.equal((await call(admin.env,'POST','/api/v1/staff/events',value)).status,400);
 }
 assert.equal(admin.batches.length,2);
});

test('event migration only creates additive isolated public-event tables',()=>{
 const sql=readFileSync(new URL('../database/migrations/0082_sura_live_events.sql',import.meta.url),'utf8');
 assert.match(sql,/CREATE TABLE IF NOT EXISTS sura_live_events/);
 assert.match(sql,/idx_sura_event_public/);
 assert.match(sql,/REFERENCES users\(id\)/);
 assert.match(sql,/CHECK\(end_at_ms > start_at_ms\)/);
 assert.doesNotMatch(sql,/\bDROP\s|\bTRUNCATE\s|\bDELETE FROM\b|\bUPDATE\s/i);
});

test('original Royal web and Android assets are identical, new pages really call server APIs',()=>{
 const h=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
 assert.equal(h,mobile);
 for(const route of ['/api/v1/me/daily','/api/v1/events','/api/v1/staff/events'])assert.ok(h.includes(route));
 assert.match(h,/S\.dailyTasks=response\.tasks/);
 assert.match(h,/S\.events=response\.events/);
 assert.match(h,/S\.eventEditor=!!data\[1\]\.event_editor/);
 assert.match(h,/Daily Task Center/);
 assert.match(h,/Event Publisher · Staff/);
 assert.match(h,/Coin rewards and claiming are not enabled/);
 assert.match(h,/Only server-published SURA CHAT events/);
 for(const x of h.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(x[1].trim())assert.doesNotThrow(()=>new Script(x[1]));
});

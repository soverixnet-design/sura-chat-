import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const source=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const web=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const androidHtml=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
function fakeEnv(){
 const queries=[];
 const room={id:'00000000-0000-4000-8000-000000000001',name:'SURA Royal Room',
   country_code:'BD',seat_count:8,join_events:12,unique_visitors:4};
 const DB={prepare(sql){const x={sql,params:[],bind(...params){this.params=params;return this;},
  async all(){queries.push({sql:this.sql,params:this.params});return {results:[room]};}};return x;}};
 return {queries,env:{DB}};
}
async function request(env,params){
 const req=new Request('https://sura.invalid/api/v1/rankings/rooms'+params);
 const res=await worker.fetch(req,env);return {status:res.status,data:await res.json()};
}
test('public ranking is real read-only room join auditing rather than fake gifts',async()=>{
 const {env,queries}=fakeEnv();
 const res=await request(env,'?period=weekly&country=bd');
 assert.equal(res.status,200);
 assert.equal(res.data.metric,'room_entries');
 assert.equal(res.data.period,'weekly');
 assert.equal(res.data.rooms[0].join_events,12);
 assert.equal(res.data.rooms[0].unique_visitors,4);
 assert.equal(res.data.rooms[0].name,'SURA Royal Room');
 assert.deepEqual(queries[0].params,['BD','BD']);
 assert.match(queries[0].sql,/room_audit_events e/);
 assert.match(queries[0].sql,/e\.action = 'join'/);
 assert.match(queries[0].sql,/COUNT\(DISTINCT e\.actor_user_id\)/);
 assert.match(queries[0].sql,/r\.status != 'closed'/);
 assert.match(queries[0].sql,/datetime\('now', '-7 days'\)/);
 assert.doesNotMatch(queries[0].sql,/gifts|wallet_ledger|gift_transactions/i);
 assert.ok(!Object.hasOwn(res.data.rooms[0],'owner_user_id'));
});
test('daily and monthly room rankings have approved server-side periods only',async()=>{
 for(const [period,window] of [['daily','-1 day'],['monthly','-30 days']]){
  const {env,queries}=fakeEnv();
  const res=await request(env,'?period='+period);
  assert.equal(res.status,200);
  assert.ok(queries[0].sql.includes("datetime('now', '"+window+"')"));
 }
 for(const params of ['?period=all','?period=weekly%27%20OR%201%3D1','?country=USA']){
  const {env,queries}=fakeEnv();
  const res=await request(env,params);
  assert.equal(res.status,400);
  assert.equal(res.data.error,'invalid_rank_filter');
  assert.equal(queries.length,0);
 }
});
test('owner reference HTML remains synchronized and enables invite code + ranking',()=>{
 assert.equal(web,androidHtml);
 assert.match(web,/id="joinRoomCode"/);
 assert.match(web,/data-act="roomInvite"/);
 assert.match(web,/navigator\.share/);
 assert.match(web,/navigator\.clipboard\.writeText/);
 assert.match(web,/form\.id==="joinRoomCode"/);
 assert.match(web,/await enter\(code\)/);
 assert.match(web,/toast\("Room created\. Opening room/);
 assert.match(web,/await enter\(created\.room\.id\)/);
 assert.match(web,/data-act="rankPeriod"/);
 assert.match(web,/rankRooms:.*myReports:/);
 assert.match(web,/room_entries/);
 assert.match(web,/if\(!form\.id&&!form\.classList\.contains\("report-review"\)\)return;/);
 // Inline script must parse on an Android WebView without optional-chain syntax.
 const start=web.indexOf('<script>');
 const end=web.lastIndexOf('</script>');
 assert.ok(start>=0&&end>start);
 const application=web.slice(start+8,end);
 assert.doesNotThrow(()=>new Function(application));
 assert.ok(!application.includes('?.'));
 assert.ok(!application.includes('??'));
});

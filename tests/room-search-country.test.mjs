import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
const loggedIn = 'A'.repeat(43);
function envAndLog(sampleRooms=[]) {
 const calls=[];
 const DB={prepare(sql){return {
   bind(...params){this.params=params;return this;},
   async first(){if(sql.includes('FROM auth_sessions AS s'))return {id:'me',public_id:'1234567',display_name:'My name',country_code:'BD',bio:'',avatar_key:null};return null;},
   async all(){calls.push({sql,params:this.params,read:true});return {results:sampleRooms};},
   async run(){calls.push({sql,params:this.params,write:true});return {meta:{changes:1}};}
 };}};
 return {env:{DB,AUTH_RL:{limit:async()=>({success:true})},ROOM_RL:{limit:async()=>({success:true})}},calls};
}
async function request(env,path,{method='GET',body,auth=false}={}) {
 const r=await worker.fetch(new Request('https://sura.invalid'+path,{
  method,headers:{...(auth?{Authorization:'Bearer '+loggedIn}:{}),'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{})
 }),env);
 return {status:r.status,data:await r.json()};
}
test('room search uses bound server-side SQL, not client-only list filtering',async()=>{
 const {env,calls}=envAndLog();
 const res=await request(env,'/api/v1/rooms?q=Golden&country=BD&sort=popular');
 assert.equal(res.status,200);
 assert.deepEqual(res.data.rooms,[]);
 const query=calls.find(c=>c.read);
 assert.match(query.sql,/instr\(lower\(r\.name\), lower\(\?\)\) > 0/);
 assert.deepEqual(query.params.slice(-7),['BD','BD','Golden','Golden','',21,0]);
});
test('room search rejects excessive input',async()=>{
 const {env}=envAndLog();
 const res=await request(env,'/api/v1/rooms?q='+encodeURIComponent('a'.repeat(65)));
 assert.equal(res.status,400);
 assert.equal(res.data.error,'invalid_room_filter');
});
test('country update is authenticated, uses allowlisted two-letter code and persists',async()=>{
 const {env,calls}=envAndLog();
 const res=await request(env,'/api/v1/me/profile',{method:'POST',auth:true,body:{display_name:'My name',bio:'Hi',country_code:'in'}});
 assert.equal(res.status,200);
 assert.equal(res.data.user.country_code,'IN');
 const u=calls.find(c=>c.write);
 assert.match(u.sql,/SET display_name = \?, bio = \?, country_code = \?/);
 assert.deepEqual(u.params,['My name','Hi','IN','me']);
});
test('country update rejects invalid codes and anonymous changes',async()=>{
 const {env}=envAndLog();
 const invalid=await request(env,'/api/v1/me/profile',{method:'POST',auth:true,body:{display_name:'My name',bio:'',country_code:'BAN'}});
 assert.equal(invalid.status,400);
 assert.equal(invalid.data.error,'invalid_profile');
 const anonymous=await request(env,'/api/v1/me/profile',{method:'POST',body:{display_name:'My name',bio:'',country_code:'BD'}});
 assert.equal(anonymous.status,401);
});

test('room search paginates using only bound, validated offsets and a stable tie-break',async()=>{
 const rows=[
  {id:'a',name:'Room A',country_code:'BD'},
  {id:'b',name:'Room B',country_code:'BD'},
  {id:'c',name:'Room C',country_code:'BD'}
 ];
 const {env,calls}=envAndLog(rows);
 const page=await request(env,'/api/v1/rooms?limit=2&offset=40&q=Room');
 assert.equal(page.status,200);
 assert.deepEqual(page.data.rooms.map(r=>r.id),['a','b']);
 assert.equal(page.data.count,2);
 assert.equal(page.data.has_more,true);
 assert.equal(page.data.next_offset,42);
 const q=calls.find(c=>c.read);
 assert.match(q.sql,/ORDER BY[\s\S]+r\.created_at DESC, r\.id DESC LIMIT \? OFFSET \?/);
 assert.deepEqual(q.params.slice(-2),[3,40]);
});

test('room offsets reject malformed and excessive pagination requests',async()=>{
 const {env}=envAndLog();
 for(const offset of ['-1','1.5','001','5001','10000000','wrong']){
  const r=await request(env,'/api/v1/rooms?offset='+encodeURIComponent(offset));
  assert.equal(r.status,400,offset);
  assert.equal(r.data.error,'invalid_room_offset',offset);
 }
 const empty=await request(env,'/api/v1/rooms?offset=20');
 assert.equal(empty.status,200);
 assert.equal(empty.data.has_more,false);
 assert.equal(empty.data.next_offset,null);
});

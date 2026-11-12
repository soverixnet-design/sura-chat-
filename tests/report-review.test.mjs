import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const source=readFileSync(new URL('../src/worker.js', import.meta.url),'utf8');
const token='A'.repeat(43);
const id='d2b9d6fc-97b0-45be-8bc3-7474422f519a';
const report={id,status:'open',reason:'spam',details:'Repeated messages',context_type:'profile',
  context_id:'',created_at_ms:1234,review_note:'',reviewed_at_ms:null,
  reporter_public_id:'1234567',reporter_name:'Reporter',
  target_public_id:'SC12345678',target_name:'Target'};
function fakeEnv({staff='',publicId='1234567',reviewChanges=1}={}){
 const writes=[];
 const DB={prepare(sql){return {
  bind(...params){this.params=params;return this;},
  async first(){
   if(sql.includes('FROM auth_sessions AS s'))return {id:'reporter-internal',public_id:publicId,
     display_name:'Reporter',country_code:'BD',email_normalized:'hidden@example.invalid'};
   return null;
  },
  async all(){
   if(sql.includes('FROM user_reports r JOIN users target'))return {results:[report]};
   if(sql.includes('FROM user_reports r JOIN users u'))return {results:[report]};
   return {results:[]};
  },
  async run(){writes.push({sql,params:this.params});return {meta:{changes:reviewChanges}};}
 };}};
 return {writes,env:{DB,SURA_MODERATOR_IDS:staff,
   AUTH_RL:{async limit(){return {success:true};}},
   ROOM_RL:{async limit(){return {success:true};}}}};
}
async function query(env,path,{method='GET',body,auth=true}={}){
 const res=await worker.fetch(new Request('https://sura.invalid'+path,{
   method,
   headers:{...(auth?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},
   ...(body===undefined?{}:{body:JSON.stringify(body)})
 }),env);
 return {status:res.status,data:await res.json()};
}

test('report review permission is authenticated and closed unless staff IDs are configured',async()=>{
 const {env}=fakeEnv();
 assert.deepEqual(await query(env,'/api/v1/staff/access'),{status:200,data:{moderator:false}});
 const queue=await query(env,'/api/v1/staff/reports');
 assert.equal(queue.status,403);
 assert.equal(queue.data.error,'moderator_required');
 const update=await query(env,'/api/v1/staff/reports/'+id+'/review',
  {method:'POST',body:{status:'resolved'}});
 assert.equal(update.status,403);
 const anon=await query(env,'/api/v1/staff/reports',{auth:false});
 assert.equal(anon.status,401);
});

test('reviewer authorization matches only exact canonical SURA public IDs',async()=>{
 for(const staff of ['12345678','123456','01234567','12345670']){
  const {env}=fakeEnv({staff});
  const r=await query(env,'/api/v1/staff/access');
  assert.equal(r.data.moderator,false);
 }
 const {env}=fakeEnv({staff:'12345678,1234567'});
 const r=await query(env,'/api/v1/staff/access');
 assert.deepEqual(r.data,{moderator:true});
});

test('only configured staff see bounded report queue with safe public IDs',async()=>{
 const {env}=fakeEnv({staff:'1234567'});
 const result=await query(env,'/api/v1/staff/reports?status=open');
 assert.equal(result.status,200);
 assert.equal(result.data.reports.length,1);
 assert.equal(result.data.reports[0].target_public_id,'12345678');
 assert.equal(result.data.reports[0].reporter_public_id,'1234567');
 assert.ok(!JSON.stringify(result.data).includes('hidden@example.invalid'));
 for(const status of ['all','deleted','foo']){
  const bad=await query(env,'/api/v1/staff/reports?status='+status);
  assert.equal(bad.status,400);
 }
});

test('moderator can change only open or reviewing reports, with bounded review note',async()=>{
 const {env,writes}=fakeEnv({staff:'1234567'});
 const ok=await query(env,'/api/v1/staff/reports/'+id+'/review',
  {method:'POST',body:{status:'resolved',note:'Checked evidence'}});
 assert.equal(ok.status,200);
 assert.deepEqual(ok.data,{updated:true,report_id:id,status:'resolved'});
 assert.match(writes[0].sql,/WHERE id = \? AND status IN \('open','reviewing'\)/);
 assert.deepEqual(writes[0].params.slice(0,3),['resolved','Checked evidence','reporter-internal']);
 const bad=await query(env,'/api/v1/staff/reports/'+id+'/review',
  {method:'POST',body:{status:'banned',note:''}});
 assert.equal(bad.status,400);
 const tooLong=await query(env,'/api/v1/staff/reports/'+id+'/review',
  {method:'POST',body:{status:'resolved',note:'n'.repeat(501)}});
 assert.equal(tooLong.status,400);
 const staleEnv=fakeEnv({staff:'1234567',reviewChanges:0}).env;
 const stale=await query(staleEnv,'/api/v1/staff/reports/'+id+'/review',
  {method:'POST',body:{status:'resolved'}});
 assert.equal(stale.status,409);
 assert.equal(stale.data.error,'report_not_open');
});

test('user sees only their own submission status, not private staff notes',async()=>{
 const {env}=fakeEnv();
 const r=await query(env,'/api/v1/me/reports');
 assert.equal(r.status,200);
 assert.equal(r.data.reports.length,1);
 assert.equal(r.data.reports[0].target_public_id,'12345678');
 assert.ok(!JSON.stringify(r.data).includes('reporter_name'));
 assert.match(source,/WHERE r.reporter_user_id = \?/);
 assert.match(source,/WHERE r.status = \?/);
 assert.match(source,/WHERE id = \? AND status IN/);
 assert.match(source,/SURA_MODERATOR_IDS/);
 assert.doesNotMatch(source,/SURA_MODERATOR_IDS.*1234567/);
});

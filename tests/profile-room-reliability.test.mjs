import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import worker from '../src/worker.js';

const token='Bearer '+'Q'.repeat(43);
function fakeEnv(){
 const calls=[];
 const DB={prepare(sql){const entry={sql,params:[]};calls.push(entry);return {
  bind(...args){entry.params=args;return this;},
  async first(){
   if(sql.includes('FROM auth_sessions AS s'))return {id:'viewer',public_id:'1234567',display_name:'Viewer'};
   if(sql.includes('FROM users AS u'))return {id:'other',public_id:'12345678',display_name:'Real Friend',country_code:'BD',bio:'Hi',avatar_key:null};
   if(sql.includes('AS followers')&&sql.includes('AS following'))return {followers:3,following:2};
   if(sql.includes('FROM user_follows'))return {one:1};
   return null;
  },
  async all(){return {results:[]};},
  async run(){throw Error('read-only test should not mutate database')}
 }}};
 return {calls,env:{DB,AUTH_RL:{async limit(){return {success:true}}},ROOM_RL:{async limit(){return {success:true}}}}};
}
async function get(env,path,authorized=true){
 const req=new Request('https://sura.invalid'+path,{headers:authorized?{Authorization:token}:{}});
 const res=await worker.fetch(req,env);
 return {status:res.status,data:await res.json()};
}

test('private main profile social counts require login and are scoped to session user',async()=>{
 const {env,calls}=fakeEnv();
 const anonymous=await get(env,'/api/v1/me/social',false);
 assert.equal(anonymous.status,401);
 const result=await get(env,'/api/v1/me/social');
 assert.equal(result.status,200);
 assert.deepEqual(result.data.social,{followers:3,following:2});
 assert.deepEqual(calls.find(c=>c.sql.includes('AS followers')).params,['viewer','viewer']);
});

test('member profiles display only aggregate real follow counts and own following state',async()=>{
 const {env,calls}=fakeEnv();
 const response=await get(env,'/api/v1/users/12345678');
 assert.equal(response.status,200);
 assert.deepEqual(response.data.user.social,{followers:3,following:2});
 assert.equal(response.data.user.is_following,true);
 assert.ok(!Object.hasOwn(response.data.user,'id'));
 assert.ok(!Object.hasOwn(response.data.user,'email_normalized'));
 assert.deepEqual(calls.find(c=>c.sql.includes('AS followers')).params,['other','other']);
});

test('owned mobile design stays identical and both profile displays have verified stats',()=>{
 const web=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const android=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
 assert.equal(web,android,'Web and Android assets must be identical');
 assert.match(web,/profile-social-stats/);
 assert.match(web,/Preview My Public Profile/);
 assert.match(web,/api\("\/api\/v1\/me\/social"\)/);
 assert.match(web,/Number\.isSafeInteger\(data\[2\]\.social\.followers\)/);
 assert.match(web,/if\(requestSeq!==S\.navigationSeq\|\|requestToken!==S\.token\|\|S\.tab!==tab\)return/);
 for(const match of web.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
  if(match[1].trim())assert.doesNotThrow(()=>new Script(match[1]));
 }
});

test('user tap on occupied own seat becomes stand action without opening own popup',()=>{
 const src=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 assert.match(src,/S\.user&&S\.user\.public_id\)\?"stand":"member"/);
 assert.match(src,/You · tap to stand/);
 assert.match(src,/Tap your seat to stand before choosing a new one/);
 assert.match(src,/const wasListening=!!\(S\.voice\.meeting&&S\.voice\.roomId===room\)/);
 const start=src.indexOf('else if(a==="stand"){');
 const end=src.indexOf('else if(a==="member")',start);
 const handler=src.slice(start,end);
 assert.ok(start>=0&&end>start);
 assert.ok(handler.indexOf('await api("/api/v1/rooms/"+room+"/stand"')<handler.indexOf('await stopVoice()'),
   'do not drop audio if server refuses the stand request');
 assert.match(handler,/if\(wasListening&&room===S\.roomId\)void joinVoice\(\)/);
 assert.match(handler,/mic muted/);
});

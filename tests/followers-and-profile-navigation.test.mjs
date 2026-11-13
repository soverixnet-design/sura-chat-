import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import worker from '../src/worker.js';

function testEnv(){
 const calls=[];
 const DB={prepare(sql){let p=[];return{
  bind(...values){p=values;return this},
  async first(){
   calls.push({sql,params:p,kind:'first'});
   if(sql.includes('FROM auth_sessions AS s'))return {id:'user-A',public_id:'1234567',display_name:'Tester'};
   return null;
  },
  async all(){
   calls.push({sql,params:p,kind:'all'});
   if(sql.includes('FROM user_follows f'))return {results:[{public_id:'SC12345678',display_name:'Friend',country_code:'BD',avatar_key:null,created_at_ms:1}]};
   return {results:[]};
  },
  async run(){throw Error('Follower read must never change DB');}
 }}};
 return {env:{DB,AUTH_RL:{async limit(){return {success:true}}},ROOM_RL:{async limit(){return {success:true}}}},calls};
}
async function get(env,auth=true){
 const r=await worker.fetch(new Request('https://sura.test/api/v1/me/followers',{headers:auth?{Authorization:'Bearer '+'F'.repeat(43)}:{}}),env);
 return {status:r.status,data:await r.json()};
}
test('followers list is private, real, id-normalized, blocking-safe and account-scoped',async()=>{
 const {env,calls}=testEnv();
 assert.equal((await get(env,false)).status,401);
 const r=await get(env);
 assert.equal(r.status,200);
 assert.equal(r.data.followers.length,1);
 assert.equal(r.data.followers[0].public_id,'12345678');
 assert.ok(!Object.hasOwn(r.data.followers[0],'id'));
 const query=calls.find(c=>c.kind==='all'&&c.sql.includes('FROM user_follows f'));
 assert.deepEqual(query.params,['user-A','user-A','user-A']);
 assert.match(query.sql,/f.followed_user_id = \?/);
 assert.match(query.sql,/u.status = 'active'/);
 assert.match(query.sql,/NOT EXISTS \(SELECT 1 FROM user_blocks/);
 assert.match(query.sql,/LIMIT 100/);
});
test('owner-supplied Royal UI connects profile counts to follower pages',()=>{
 const web=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const android=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
 assert.equal(web,android);
 assert.match(web,/data-value="followers"[^>]*>\x27\+fmt\(S\.social&&S\.social\.followers\)/);
 assert.match(web,/data-value="following"[^>]*>\x27\+fmt\(S\.social&&S\.social\.following\)/);
 assert.match(web,/api\("\/api\/v1\/me\/followers"\)/);
 assert.match(web,/S\.myFollowers=response\.followers/);
 assert.match(web,/My Followers/);
 assert.match(web,/My Moments/);
 assert.match(web,/else if\(S\.tab==="profile"\)void go\("profile"\)/);
 for(const script of web.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(script[1].trim())assert.doesNotThrow(()=>new Script(script[1]));
});

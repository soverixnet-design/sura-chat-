import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import worker from '../src/worker.js';

const bearer='Bearer '+'X'.repeat(43);
function fixture(){
 const reads=[];
 const env={DB:{prepare(sql){const q={sql,params:[]};reads.push(q);return {
   bind(...p){q.params=p;return this;},
   async first(){if(sql.includes('FROM auth_sessions AS s'))return {id:'user-123',public_id:'1234567',display_name:'Member',country_code:'BD'};return null;},
   async all(){if(sql.includes('JOIN users u ON u.id = f.follower_user_id'))return {results:[{public_id:'SC12345678',display_name:'Follower',country_code:'BD',avatar_key:null,created_at_ms:1234}]};return {results:[]}},
   async run(){throw Error('followers are read only')}
  }}},AUTH_RL:{async limit(){return {success:true}}},ROOM_RL:{async limit(){return {success:true}}}};
 return {env,reads};
}
async function get(env,path,auth=true){
 const res=await worker.fetch(new Request('https://sura.invalid'+path,{headers:auth?{Authorization:bearer}:{}}),env);
 return {status:res.status,data:await res.json()};
}

test('my followers endpoint requires login, hides blocked users and internal IDs',async()=>{
 const f=fixture();
 assert.equal((await get(f.env,'/api/v1/me/followers',false)).status,401);
 const response=await get(f.env,'/api/v1/me/followers');
 assert.equal(response.status,200);
 assert.deepEqual(response.data.followers.map(r=>r.public_id),['12345678']);
 assert.ok(!Object.hasOwn(response.data.followers[0],'id'));
 const query=f.reads.find(q=>q.sql.includes('JOIN users u ON u.id = f.follower_user_id'));
 assert.match(query.sql,/NOT EXISTS \(SELECT 1 FROM user_blocks/);
 assert.match(query.sql,/f.followed_user_id = \?/);
 assert.match(query.sql,/LIMIT 100/);
 assert.deepEqual(query.params,['user-123','user-123','user-123']);
});

test('my moments and followers pages navigate to existing authenticated SURA APIs',()=>{
 const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
 const mobile=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
 assert.equal(html,mobile);
 assert.match(html,/api\("\/api\/v1\/me\/followers"\)/);
 assert.match(html,/api\("\/api\/v1\/moments\?author="\+encodeURIComponent\(memberId\)\+"\&limit=20"\)/);
 assert.match(html,/data-value="followers">Followers/);
 assert.match(html,/data-value="myMoments">My Moments/);
 assert.match(html,/My Followers/);
 assert.match(html,/My Moments/);
 for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(m[1].trim())assert.doesNotThrow(()=>new Script(m[1]));
});

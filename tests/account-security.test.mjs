import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const bearer = 'Bearer ' + 'X'.repeat(43);
async function fixture(){
 const secret='12345678';
 const salt=new Uint8Array(16).fill(7);
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),'PBKDF2',false,['deriveBits']);
 const hashed=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},key,256));
 const dbWrites=[];
 const DB={prepare(sql){return {
  bind(...params){this.params=params;return this;},
  async first(){
   if(sql.includes('FROM auth_sessions AS s'))return {id:'u1',public_id:'1234567',status:'active'};
   if(sql.includes('FROM user_credentials WHERE user_id'))return {salt_b64:Buffer.from(salt).toString('base64'),password_hash_b64:Buffer.from(hashed).toString('base64'),iterations:100000};
   return null;
  },
  async run(){dbWrites.push({sql,params:this.params});return {meta:{changes:1}};}
 };}};
 return {secret,dbWrites,env:{DB,AUTH_RL:{async limit(){return {success:true};}}}};
}
async function post(env,path,body,authenticated=true){
 const res=await worker.fetch(new Request('https://test.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(authenticated?{Authorization:bearer}:{})},body:JSON.stringify(body)}),env);
 return {status:res.status,body:await res.json()};
}
test('account security rejects anonymous writes',async()=>{
 const {env,secret}=await fixture();
 for(const url of ['/api/v1/auth/change-password','/api/v1/auth/revoke-other-sessions']){
  const result=await post(env,url,{current_password:secret,new_password:'StrongerPassword2026'},false);
  assert.equal(result.status,401);
 }
});
test('account security verifies current credential before changing it',async()=>{
 const {env,dbWrites}=await fixture();
 const result=await post(env,'/api/v1/auth/change-password',{current_password:'00000000',new_password:'StrongerPassword2026'});
 assert.equal(result.status,401);assert.equal(result.body.error,'invalid_current_password');
 assert.equal(dbWrites.length,0);
});
test('changing password changes hash and revokes only other sessions',async()=>{
 const {env,secret,dbWrites}=await fixture();
 const result=await post(env,'/api/v1/auth/change-password',{current_password:secret,new_password:'StrongerPassword2026'});
 assert.equal(result.status,200);
 assert.equal(result.body.password_changed,true);
 assert.equal(dbWrites.length,2);
 assert.match(dbWrites[0].sql,/WHERE user_id = \? AND password_hash_b64 = \?/);
 assert.match(dbWrites[1].sql,/token_sha256 <> \?/);
});
test('session revocation checks current password and preserves this session',async()=>{
 const {env,secret,dbWrites}=await fixture();
 const result=await post(env,'/api/v1/auth/revoke-other-sessions',{current_password:secret});
 assert.equal(result.status,200);assert.equal(result.body.other_sessions_revoked,true);
 assert.equal(dbWrites.length,1);
 assert.match(dbWrites[0].sql,/token_sha256 <> \?/);
});

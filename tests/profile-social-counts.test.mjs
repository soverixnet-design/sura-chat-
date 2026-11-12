import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import worker from '../src/worker.js';

const web=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const android=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
const bearer='Bearer '+'Z'.repeat(43);

function makeEnv(){
 const sqls=[];
 return {sqls,env:{DB:{prepare(sql){return {
   bind(...args){this.args=args;return this;},
   async first(){
    sqls.push({sql,args:this.args});
    if(sql.includes('FROM auth_sessions AS s'))return {id:'self',public_id:'1234567',display_name:'Me',bio:'hi',avatar_key:null,email_normalized:'private@example.com',status:'active'};
    if(sql.includes('FROM users AS u'))return {id:'peer',public_id:'SC12345678',display_name:'Peer',country_code:'BD',bio:'hello',avatar_key:null};
    if(sql.includes('AS followers_count'))return {followers_count:3,following_count:7};
    if(sql.includes('FROM user_blocks'))return null;
    if(sql.includes('FROM user_follows'))return null;
    return null;
   },async all(){return {results:[]}}};}}}};
}
async function get(env,path){
 const response=await worker.fetch(new Request('https://sura.invalid'+path,{headers:{Authorization:bearer}}),env);
 return {status:response.status,json:await response.json()};
}
test('public member social counts are from server records, with no private email leakage',async()=>{
 const {env,sqls}=makeEnv();
 const response=await get(env,'/api/v1/users/12345678');
 assert.equal(response.status,200);
 assert.equal(response.json.user.public_id,'12345678');
 assert.equal(response.json.user.followers_count,3);
 assert.equal(response.json.user.following_count,7);
 assert.equal(response.json.user.email,undefined);
 assert.equal(response.json.user.id,undefined);
 const query=sqls.find(q=>q.sql.includes('AS followers_count'));
 assert.ok(query);
 assert.deepEqual(query.args,['peer','peer']);
});
test('authenticated main profile receives its own counts and email',async()=>{
 const {env,sqls}=makeEnv();
 const response=await get(env,'/api/v1/me');
 assert.equal(response.status,200);
 assert.equal(response.json.user.followers_count,3);
 assert.equal(response.json.user.following_count,7);
 assert.equal(response.json.user.email,'private@example.com');
 assert.deepEqual(sqls.find(q=>q.sql.includes('AS followers_count')).args,['self','self']);
});
test('Royal main and member profiles show verified counts, never fabricated balances',()=>{
 assert.equal(web,android);
 assert.match(web,/function socialStatsHtml\(user\)/);
 assert.match(web,/sura-social-stats/);
 assert.match(web,/socialStatsHtml\(user\)/);
 const functionSource=web.match(/function socialStatsHtml\(user\)\{[\s\S]*?\n \}/)?.[0];
 assert.ok(functionSource);
 const stats=new Function('const fmt=v=>String(v);'+functionSource+';return socialStatsHtml;')();
 assert.match(stats({followers_count:3,following_count:7}),/3/);
 assert.match(stats({followers_count:3,following_count:7}),/7/);
 assert.match(stats({followers_count:null,following_count:undefined}),/—/);
 for(const [,source] of web.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(source.trim())assert.doesNotThrow(()=>new Script(source));
});

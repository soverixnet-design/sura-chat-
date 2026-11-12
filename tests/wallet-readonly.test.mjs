import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

function envFixture(){
 const statements=[];
 const DB={prepare(sql){statements.push(sql);return {
  bind(...args){this.args=args;return this;},
  async first(){if(sql.includes('FROM auth_sessions AS s'))return {id:'self',public_id:'1234567',status:'active'};return null;},
  async all(){
   if(sql.includes('FROM wallets w LEFT JOIN'))return {results:[{wallet_type:'main',currency:'COIN',balance_units:1250,ledger_entries:2}]};
   if(sql.includes('FROM wallet_ledger l JOIN wallets w'))return {results:[{wallet_type:'main',amount_units:250,operation:'credit',created_at:'2026-11-13 00:00:00'}]};
   return {results:[]};
  }
 };}};
 return {env:{DB},statements};
}
async function get(env,authenticated=true){
 const res=await worker.fetch(new Request('https://example.invalid/api/v1/me/wallets',{headers:authenticated?{Authorization:'Bearer '+'X'.repeat(43)}:{}}),env);
 return {status:res.status,body:await res.json()};
}
test('wallets require a real session',async()=>{
 const {env}=envFixture();const r=await get(env,false);
 assert.equal(r.status,401);assert.equal(r.body.error,'login_required');
});
test('wallet balances and history come from the caller ledger only',async()=>{
 const {env,statements}=envFixture();const r=await get(env);
 assert.equal(r.status,200);assert.equal(r.body.transactions_enabled,false);
 assert.deepEqual(r.body.wallets,[{wallet_type:'main',currency:'COIN',balance_units:1250,ledger_entries:2}]);
 assert.equal(r.body.entries[0].amount_units,250);
 assert.ok(statements.some(sql=>sql.includes('FROM wallets w LEFT JOIN')&&sql.includes('WHERE w.user_id = ?')));
 assert.ok(statements.some(sql=>sql.includes('FROM wallet_ledger l JOIN wallets w')&&sql.includes('WHERE w.user_id = ?')));
});

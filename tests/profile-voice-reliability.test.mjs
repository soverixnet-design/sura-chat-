import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import worker from '../src/worker.js';

const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const asset=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
const native=readFileSync(new URL('../android/app/src/main/java/com/soverixnet/surachat/MainActivity.java',import.meta.url),'utf8');

test('SURA Royal Web and Android profile/room design remain exactly the same',()=>{
 assert.equal(asset,html);
 assert.match(html,/Join Live Voice Rooms/);
 assert.match(html,/Featured Voice Rooms/);
 assert.match(html,/Member Profile/);
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(match[1].trim()) assert.doesNotThrow(()=>new Script(match[1]));
});

test('legacy SC numeric aliases normalize before profile or avatar API requests',()=>{
 const helper=html.match(/function canonicalMemberId\(value\)\{[\s\S]*?\n \}/)?.[0];
 assert.ok(helper,'canonical helper present');
 const normalize=new Function(helper+';return canonicalMemberId;')();
 assert.equal(normalize('SC12345678'),'12345678');
 assert.equal(normalize('12345678'),'12345678');
 assert.equal(normalize('1234567'),'1234567');
 assert.equal(normalize('SC1234567'),'1234567');
 for(const input of ['abc','SC','SC00000/../../../','123 45678','SC123456789',null])assert.equal(normalize(input),'');
 assert.match(html,/const id=canonicalMemberId\(user&&user\.public_id\)/);
 assert.match(html,/const id=canonicalMemberId\(publicId\)/);
 assert.match(html,/\/api\/v1\/users\/"\+encodeURIComponent\(id\)\+"\/avatar/);
});

test('room seat snapshot returns canonical member IDs while preserving avatar keys',async()=>{
 const id='00000000-0000-4000-8000-000000000001';
 const env={DB:{prepare(sql){return {bind(...params){this.params=params;return this;},async first(){
   if(sql.includes('SELECT id, name, seat_count, status, announcement FROM rooms'))
    return {id,name:'Royal Room',seat_count:8,status:'open',announcement:''};
   return null;
 },async all(){return {results:[
  {seat_number:1,is_locked:0,public_id:'SC12345678',display_name:'Legacy',avatar_key:'avatars/legacy/a.webp'},
  {seat_number:2,is_locked:0,public_id:'1234567',display_name:'New',avatar_key:null},
  {seat_number:3,is_locked:0,public_id:null,display_name:null,avatar_key:null}
 ]};}};}}};
 const res=await worker.fetch(new Request('https://sura.invalid/api/v1/rooms/'+id+'/seats'),env);
 assert.equal(res.status,200);
 const data=await res.json();
 assert.deepEqual(data.seats.map(s=>s.public_id),['12345678','1234567',null]);
 assert.equal(data.seats[0].avatar_key,'avatars/legacy/a.webp');
 assert.equal(data.seats[0].seat_number,1);
});

test('terminal RealtimeKit network failure clears dead session for a real Retry Voice',()=>{
 assert.match(html,/function resetFailedVoice\(liveMeeting, roomId, generation, kind\)/);
 assert.match(html,/if\(state==="failed"&&\(transport==="consuming"/);
 assert.match(html,/socketConnectionUpdate/);
 assert.match(html,/await stopVoice\(\)/);
 assert.match(html,/voiceStatus\("Retry Voice"\)/);
 assert.match(html,/S\.voice\.generation!==generation\+1/);
 assert.match(html,/state==="failed"/);
 assert.doesNotMatch(html,/state==="disconnected"\)\s*void resetFailedVoice/);
});

test('native backup signup follows same new-password rule as WebView and API',()=>{
 assert.match(native,/10–64 chars: letters \+ numbers/);
 assert.match(native,/password\.length\(\)<10/);
 assert.match(native,/password\.matches\("\(\?s\)\.\*\[A-Za-z\]\.\*"\)/);
 assert.match(native,/\.put\("password",password\)/);
 assert.doesNotMatch(native,/8-digit numeric password/);
});

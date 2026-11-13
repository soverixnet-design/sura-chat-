import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import worker from '../src/worker.js';

const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const android=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');

test('SURA owner Royal web and Android design remain byte-identical and parseable',()=>{
 assert.equal(html,android);
 assert.match(html,/Join Live Voice Rooms/);
 for(const block of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if(block[1].trim())assert.doesNotThrow(()=>new Script(block[1]));
 }
});

test('legacy numeric aliases normalize before opening member profile, DM or avatar',()=>{
 const helper=html.match(/function canonicalMemberId\(value\)\{[\s\S]*?\n \}/)?.[0];
 assert.ok(helper);
 const normalize=new Function(helper+';return canonicalMemberId;')();
 assert.equal(normalize('1234567'),'1234567');
 assert.equal(normalize('SC1234567'),'1234567');
 assert.equal(normalize('12345678'),'12345678');
 assert.equal(normalize('SC12345678'),'12345678');
 for(const bad of ['',null,' SC12345678','SC1234','SC123456789','12345/../','abc']) assert.equal(normalize(bad),'');
 assert.match(html,/const id=canonicalMemberId\(user&&user\.public_id\)/);
 assert.match(html,/const id=canonicalMemberId\(publicId\)/);
 assert.match(html,/async function openDm\(input\)\{const id=canonicalMemberId\(input\)/);
});

test('SURA staging room seats provide numeric IDs and retain uploaded avatar keys',async()=>{
 const roomId='00000000-0000-4000-8000-000000000001';
 const env={DB:{prepare(sql){return{
   bind(...params){this.params=params;return this;},
   async first(){
     if(sql.includes('SELECT id, name, seat_count, status, announcement FROM rooms'))return {id:roomId,name:'Room',seat_count:3,status:'open',announcement:''};
     return null;
   },
   async all(){return {results:[
     {seat_number:1,public_id:'SC12345678',avatar_key:'avatars/a.webp',is_locked:0,display_name:'Old'},
     {seat_number:2,public_id:'1234567',avatar_key:null,is_locked:0,display_name:'New'},
     {seat_number:3,public_id:null,avatar_key:null,is_locked:0,display_name:null}
   ]};}
 };}}};
 const response=await worker.fetch(new Request('https://example.test/api/v1/rooms/'+roomId+'/seats'),env);
 assert.equal(response.status,200);
 const body=await response.json();
 assert.deepEqual(body.seats.map(s=>s.public_id),['12345678','1234567',null]);
 assert.equal(body.seats[0].avatar_key,'avatars/a.webp');
 assert.equal(body.seats[0].seat_number,1);
});

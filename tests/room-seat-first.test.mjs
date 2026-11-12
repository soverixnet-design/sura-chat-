import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const web=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const android=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
const room=web.slice(web.indexOf('function syncRoom(){'),web.indexOf('async function leave(targetTab'));

test('room seat profiles appear before chat fetch finishes',()=>{
 assert.ok(room.length>1500);
 const start=room.indexOf('const messageRequest=api(');
 const requestSeats=room.indexOf('const a=await api(');
 const seatRender=room.indexOf('E("seats").innerHTML=');
 const chatAwait=room.indexOf('const messageResult=await messageRequest');
 const chatRender=room.indexOf('for(const m of b.messages)');
 assert.ok(start>=0 && requestSeats>start);
 assert.ok(seatRender>requestSeats);
 assert.ok(chatAwait>seatRender,'seat cards should not await message endpoint');
 assert.ok(chatRender>chatAwait);
 assert.match(room,/\.then\(data=>\(\{data\}\),error=>\(\{error\}\)\)/);
 assert.match(room,/if\(id!==S\.roomId\|\|generation!==S\.roomGeneration\)return/);
 assert.match(room,/if\(messageResult\.error\)throw messageResult\.error/);
});
test('updated Royal layout is identical and parses in Android/Web',()=>{
 assert.equal(web,android);
 for(const [,body] of web.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(body.trim())assert.doesNotThrow(()=>new Script(body));
});

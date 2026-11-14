import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const android=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');

test('Royal reference remains byte-identical and embedded JS parses',()=>{
 assert.equal(html,android);
 assert.match(html,/SURA user-supplied Royal HTML\/mobile-fit styling/);
 for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))
  if(match[1].trim())assert.doesNotThrow(()=>new Script(match[1]));
});

test('Cloudflare RealtimeKit gets one preloaded remote audio element before joining',()=>{
 assert.equal((html.match(/id="suraRemoteAudio"/g)||[]).length,1);
 assert.equal((html.match(/id="suraVoiceAudio"/g)||[]).length,1);
 assert.match(html,/<audio id="suraRemoteAudio"[^>]*autoplay[^>]*playsinline/);
 const start=html.indexOf('async function joinVoice(){');
 const end=html.indexOf('async function enter(id)',start);
 const join=html.slice(start,end);
 assert.ok(start>0&&end>start);
 const bind=join.indexOf('audio.preloadedAudioElem=preloaded;');
 const meeting=join.indexOf('audio.meeting=meeting;',bind);
 const connect=join.indexOf('await meeting.join();',meeting);
 assert.ok(bind>0&&meeting>bind&&connect>meeting);
 assert.match(join,/preloaded.muted=false/);
 assert.match(join,/preloaded.pause\(\);preloaded.srcObject=null/);
 const stop=html.slice(html.indexOf('async function stopVoice(){'),start);
 assert.match(stop,/audio.preloadedAudioElem=undefined/);
 assert.match(stop,/preloaded.pause\(\);preloaded.srcObject=null/);
});

test('room seat loads despite chat API failure, warns only once, and recovers',async()=>{
 const start=html.indexOf('function syncRoom(){');
 const end=html.indexOf('async function leave(',start);
 assert.ok(start>0&&end>start);
 const source=html.slice(start,end);
 let failChat=true;
 const calls=[];
 const notices=[];
 const elements={
  roomName:{textContent:''},roomInfo:{textContent:''},announcement:{textContent:''},
  seats:{innerHTML:''},chat:{childNodes:[],scrollTop:0,scrollHeight:0,
   appendChild(node){this.childNodes.push(node);},removeChild(node){this.childNodes.shift();},
   get firstChild(){return this.childNodes[0];}}
 };
 const S={roomId:'99999999-9999-4999-9999-999999999999',roomGeneration:1,
  roomSyncPromise:null,chatError:false,seatSig:'',after:0,lastRoomSeats:[],user:{public_id:'1234567'}};
 const context=createContext({
  S,E:(id)=>elements[id],toast:(m)=>notices.push(m),
  canonicalMemberId:value=>String(value||'').replace(/^SC(?=\d{7,8}$)/,''), refreshHeaderAvatar:()=>{},
  api:async(path)=>{
   calls.push(path);
   if(path.includes('/seats'))return {room:{name:'Real Room',seat_count:8,status:'active',announcement:'Welcome'},seats:[{seat_number:1,is_locked:false,public_id:null,display_name:null,avatar_key:null}]};
   if(failChat)throw Error('chat offline');
   return {messages:[]};
  },
  stableSeatSignature:(seats)=>JSON.stringify(seats),
  safe:(x)=>String(x??''),avatarHtml:()=>'',document:{createElement:()=>({appendChild(){}})}
 });
 new Script(source+'\n globalThis.syncRoom=syncRoom;').runInContext(context);
 await context.syncRoom();
 assert.equal(elements.roomName.textContent,'Real Room');
 assert.equal(elements.roomInfo.textContent,'8 seats · active');
 assert.match(elements.seats.innerHTML,/data-n="1"/);
 assert.equal(S.chatError,true);
 assert.equal(notices.length,1);
 await context.syncRoom();
 assert.equal(notices.length,1,'chat failure should not create repeated toast spam');
 failChat=false;
 await context.syncRoom();
 assert.equal(S.chatError,false);
 assert.equal(elements.roomName.textContent,'Real Room');
 assert.ok(calls.length>=6);
});

test('room transition clears stale seat and chat error state',()=>{
 assert.match(html,/S\.heartbeatUnsupported=false;S\.chatError=false;S\.after=0;S\.seatSig="";S\.lastRoomSeats=\[\]/);
 assert.match(html,/S\.poll=null;S\.heartbeatTimer=null;S\.seatSig="";S\.lastRoomSeats=\[\];S\.chatError=false/);
 assert.match(html,/S\.roomGeneration\+\+;S\.roomSyncPromise=null;S\.lastRoomSeats=\[\];S\.chatError=false/);
});

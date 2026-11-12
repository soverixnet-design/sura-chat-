import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const start=html.indexOf('async function stopVoice()');
const end=html.indexOf('async function enter(id)',start);
assert.ok(start>=0&&end>start,'run the actual app voice functions');

function fixture(){
 const pending=[],leaves=[],statuses=[],notifications=[];
 const audio={meeting:undefined};
 const S={roomId:'room-a',voice:{meeting:null,roomId:'',role:'',busy:false,busyGeneration:-1,generation:0}};
 const sdk={init({authToken}){return new Promise(resolve=>pending.push({authToken,resolve}));}};
 const context=vm.createContext({
  S,console,E:()=>audio,voiceStatus:s=>statuses.push(s),voiceNet:s=>statuses.push(s),
  toast:s=>notifications.push(s),showVoiceTransports:()=>{},
  loadVoiceSdk:async()=>sdk,loadVoiceUi:async()=>{},
  api:async(path)=>{
   if(path.endsWith('/voice/status'))return {configured:true,role:'speaker',seat:1};
   if(path.endsWith('/voice/token'))return {token:path.includes('room-a')?'token-a':'token-b',role:'speaker',seat:1};
   throw Error('unexpected request '+path);
  }
 });
 vm.runInContext(html.slice(start,end),context);
 function meeting(name){
  return {name,meta:{on(){}},self:{audioEnabled:false,on(){},async disableAudio(){}},
    async join(){},async leave(){leaves.push(name);}};
 }
 return {context,S,audio,pending,leaves,statuses,notifications,meeting};
}
async function until(predicate){
 for(let n=0;n<100;n++){if(predicate())return;await new Promise(resolve=>setImmediate(resolve));}
 throw Error('The current voice connection did not reach expected async step');
}

test('leaving during SDK init allows instant voice join in the next room without stale busy reset',async()=>{
 const f=fixture();
 const a=f.context.joinVoice();
 await until(()=>f.pending.length===1);
 assert.equal(f.S.voice.busy,true);
 assert.equal(f.pending[0].authToken,'token-a');

 await f.context.stopVoice();
 assert.equal(f.S.voice.busy,false,'cancelled join releases spinner immediately');
 assert.equal(f.S.voice.generation,1);

 f.S.roomId='room-b';
 const b=f.context.joinVoice();
 await until(()=>f.pending.length===2);
 assert.equal(f.pending[1].authToken,'token-b');
 assert.equal(f.S.voice.busy,true);
 const meetingA=f.meeting('A');
 f.pending[0].resolve(meetingA);
 await a;
 assert.deepEqual(f.leaves,['A'],'stale SDK instance closed');
 assert.equal(f.S.voice.busy,true,'stale completion cannot unlock newer room');
 const meetingB=f.meeting('B');
 f.pending[1].resolve(meetingB);
 await b;
 assert.equal(f.S.voice.busy,false);
 assert.equal(f.S.voice.meeting,meetingB);
 assert.equal(f.S.voice.roomId,'room-b');
 assert.equal(f.audio.meeting,meetingB);
});

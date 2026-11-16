import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import {livekitConfigured, signLivekit, verifyLivekit, authorizeLivekit, revokeLivekit, issueLivekit} from '../src/livekit.js';
const room='11111111-1111-4111-8111-111111111111';
const identity='22222222-2222-4222-8222-222222222222';
const permission={user:{id:'u1',display_name:'Test'},role:'speaker',seat:1};
function envFor({seat=1,role='speaker',left_at=null,banned=0,exists=true,apiOk=true,collision=false}={}) {
  let status='active';const writes=[];
  const env={LIVEKIT_ENABLED:'true',LIVEKIT_URL:'wss://sura-live.sharika.app',LIVEKIT_API_KEY:'test-key-for-suite',LIVEKIT_API_SECRET:'test-secret-only-'.repeat(4),
    LIVEKIT_FETCH:async()=>new Response(JSON.stringify(apiOk?{}:{code:'unavailable'}),{status:apiOk?200:503}),
    DB:{prepare(sql){return {bind(...args){this.args=args;return this;},async first(){
      if(sql.startsWith('SELECT identity'))return exists?{identity}:null;
      return exists&&status==='active'?{role,seat,left_at,banned,room_status:'open',user_status:'active'}:null;
    },async run(){writes.push(sql);if(sql.startsWith('UPDATE'))status='revoking';if(sql.startsWith('DELETE'))status='deleted';return {meta:{changes:collision?0:1}};}}}}
  };return {env,writes,status:()=>status};
}
const claims=(speaker=true)=>({sub:identity,video:{room:'sura-'+room,roomJoin:true,canPublish:speaker,canSubscribe:true,canPublishData:false,canPublishSources:['microphone']}});
test('Oracle provider is opt-in and cannot send credentials to arbitrary hosts',()=>{
  const {env}=envFor();assert.equal(livekitConfigured(env),true);
  for(const change of [{LIVEKIT_ENABLED:'false'},{LIVEKIT_URL:'wss://evil.test'},{LIVEKIT_API_SECRET:'short'}])assert.equal(livekitConfigured({...env,...change}),false);
});
test('JWT validates HMAC, issuer, expiry and algorithm; rejects altered tokens',async()=>{
  const {env}=envFor();const token=await signLivekit(env,claims());assert.equal((await verifyLivekit(env,token)).sub,identity);
  const parts=token.split('.');parts[1]=Buffer.from(JSON.stringify({...claims(),iss:'evil',exp:9999999999})).toString('base64url');
  await assert.rejects(verifyLivekit(env,parts.join('.')),{code:'invalid_rtc_token'});
  await assert.rejects(verifyLivekit(env,await signLivekit(env,claims(),-1)),{code:'invalid_rtc_token'});
  await assert.rejects(verifyLivekit(env,'bad'),{code:'invalid_rtc_token'});
});
test('gateway permits current role and rejects stale seat, departed member, ban and unknown identity',async()=>{
  for(const change of [{},{seat:null,role:'listener'}]){const {env}=envFor(change);assert.equal(await authorizeLivekit(env,await signLivekit(env,claims(change.seat!==null))),true);}
  for(const change of [{seat:null},{left_at:'now'},{banned:1},{exists:false}]){const {env}=envFor(change);await assert.rejects(authorizeLivekit(env,await signLivekit(env,claims())));}
});
test('gateway rejects admin, camera and data grants on client connections',async()=>{
  const {env}=envFor();
  for(const video of [{roomAdmin:true,room:'sura-'+room},{...claims().video,canPublishSources:['camera']},{...claims().video,canPublishData:true}]){
    await assert.rejects(authorizeLivekit(env,await signLivekit(env,{sub:identity,video})));
  }
});
test('revocation rejects token replay before remote removal and retains failed revoke for retry',async()=>{
  const x=envFor({apiOk:false});const token=await signLivekit(x.env,claims());
  await assert.rejects(revokeLivekit(x.env,room,'u1'),{code:'livekit_unavailable'});
  assert.equal(x.status(),'revoking');assert.ok(!x.writes.some(s=>s.startsWith('DELETE')));
  await assert.rejects(authorizeLivekit(x.env,token));
  x.env.LIVEKIT_FETCH=async()=>new Response('{}');await revokeLivekit(x.env,room,'u1');assert.equal(x.status(),'deleted');
});
test('issued listener tokens cannot publish and permission races issue no token',async()=>{
  const x=envFor({exists:false});const listener={...permission,role:'listener',seat:null};
  const result=await issueLivekit(x.env,room,listener,async()=>listener);
  const decoded=await verifyLivekit(x.env,result.token);
  assert.equal(decoded.video.canPublish,false);assert.equal(decoded.video.canPublishData,false);assert.equal(result.expires_in,120);
  await assert.rejects(issueLivekit(x.env,room,permission,async()=>listener),{code:'voice_permissions_changed'});
  const y=envFor({exists:false,collision:true});await assert.rejects(issueLivekit(y.env,room,permission,async()=>permission),{code:'voice_token_retry'});
});
test('LiveKit client disconnect removes attached remote media and does not publish on join',async()=>{
  const source=readFileSync(new URL('../web/sura-livekit.js',import.meta.url),'utf8');
  assert.equal(source,readFileSync(new URL('../android/app/src/main/assets/sura-livekit.js',import.meta.url),'utf8'));
  const handlers={};let published=0,removed=0,connected=0;
  const roomMock={localParticipant:{isMicrophoneEnabled:false,setMicrophoneEnabled:async v=>{published+=v?1:0;}},on:(n,f)=>{handlers[n]=f;},connect:async()=>{connected++;},startAudio:async()=>{},disconnect:async()=>{}};
  const context=createContext({window:{LivekitClient:{Room:function(){return roomMock;},RoomEvent:{TrackSubscribed:'track',TrackUnsubscribed:'untrack',ConnectionStateChanged:'state',Disconnected:'disconnect'},Track:{Kind:{Audio:'audio'}},DisconnectReason:{PARTICIPANT_REMOVED:4}}},document:{body:{appendChild(){}}},Promise,Set});
  new Script(source).runInContext(context);const adapter=await context.window.SuraLiveKit.load();const meeting=await adapter.init({serverUrl:'wss://test',authToken:'test'});
  await meeting.join();assert.equal(connected,1);assert.equal(published,0);
  handlers.track({kind:'audio',attach:()=>({setAttribute(){},play:()=>Promise.resolve(),pause(){},remove(){removed++;}})});
  await meeting.self.enableAudio();assert.equal(published,1);await meeting.leave();assert.equal(removed,1);
});

test('unexpected LiveKit disconnect clears remote audio and ignores late tracks', async () => {
  const source=readFileSync(new URL('../web/sura-livekit.js',import.meta.url),'utf8');
  const handlers={};let attached=0,paused=0,removed=0,disconnected=0;
  const remoteElement={setAttribute(){},play:()=>Promise.resolve(),pause(){paused++;},remove(){removed++;}};
  const roomMock={
    localParticipant:{isMicrophoneEnabled:false,setMicrophoneEnabled:async()=>{}},
    on:(name,handler)=>{handlers[name]=handler;},
    connect:async()=>{},startAudio:async()=>{},disconnect:async()=>{disconnected++;}
  };
  const context=createContext({window:{LivekitClient:{
    Room:function(){return roomMock;},
    RoomEvent:{TrackSubscribed:'track',TrackUnsubscribed:'untrack',ConnectionStateChanged:'state',Disconnected:'disconnect'},
    Track:{Kind:{Audio:'audio'}},
    DisconnectReason:{PARTICIPANT_REMOVED:4}
  }},document:{body:{appendChild(){attached++;}}},Promise,Set});
  new Script(source).runInContext(context);
  const adapter=await context.window.SuraLiveKit.load();
  const meeting=await adapter.init({serverUrl:'wss://test',authToken:'test'});
  let exitState=null;
  meeting.self.on('roomLeft',event=>{exitState=event.state;});
  await meeting.join();
  const track={kind:'audio',attach:()=>remoteElement,detach:()=>[remoteElement]};
  handlers.track(track);
  assert.equal(attached,1);
  handlers.disconnect(4); // Server kick, no explicit leave() yet.
  assert.equal(exitState,'kicked');
  assert.equal(paused,1);
  assert.equal(removed,1);
  handlers.track(track); // Delayed callback must not revive audio.
  assert.equal(attached,1);
  await meeting.leave(); // Cleanup remains idempotent.
  assert.equal(disconnected,1);
  assert.equal(removed,1);
});

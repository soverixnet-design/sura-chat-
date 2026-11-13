import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';

const web = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const android = readFileSync(new URL('../android/app/src/main/assets/sura-chat.html', import.meta.url), 'utf8');
const start = web.indexOf('function syncRoom(){');
const end = web.indexOf('\n async function leave(', start);
assert.ok(start >= 0 && end > start, 'load actual SURA room synchronization code');
const syncSource = web.slice(start, end);

function fixture() {
  let finishChat, failChat;
  const calls = [];
  const elements = {
    roomName: {textContent:''}, roomInfo:{textContent:''},
    announcement:{textContent:''}, seats:{innerHTML:''},
    chat:{childNodes:[], appendChild(){throw Error('unexpected chat item');}}
  };
  const state = {
    roomId:'room-one', roomGeneration:1, roomSyncPromise:null,
    user:{public_id:'1234567'}, after:0, seatSig:'',
    lastRoomSeats:[], chatError:false
  };
  const messages = [];
  const context = createContext({
    S:state, E:id=>elements[id], safe:v=>String(v), avatarHtml:()=>'avatar',
    stableSeatSignature:seats=>JSON.stringify(seats),
    toast:v=>messages.push(v),
    api:path=>{
      calls.push(path);
      if(path.endsWith('/seats')) return Promise.resolve({
        room:{name:'Actual Room',seat_count:2,status:'open',announcement:'Hello'},
        seats:[{seat_number:1,public_id:'1234567',display_name:'Me',is_locked:false,avatar_key:null},
          {seat_number:2,public_id:null,display_name:null,is_locked:false,avatar_key:null}]
      });
      if(path.includes('/messages?after=')) return new Promise((resolve,reject)=>{
        finishChat=resolve;failChat=reject;
      });
      throw Error('unexpected API '+path);
    }
  });
  new Script(syncSource).runInContext(context);
  return {state,elements,calls,messages,sync:()=>new Script('syncRoom()').runInContext(context),
    resolveChat:()=>finishChat({messages:[]}),rejectChat:()=>failChat(Error('slow chat'))};
}

test('user-provided web/Android room designs stay synchronized',()=>{
  assert.equal(web,android);
  assert.match(web,/Join Live Voice Rooms/);
});

test('room seats and announcement appear before slow chat finishes',async()=>{
  const f=fixture();
  const pending=f.sync();
  await Promise.resolve();
  await Promise.resolve();
  assert.match(f.elements.seats.innerHTML,/You · tap to stand/);
  assert.match(f.elements.seats.innerHTML,/Open/);
  assert.equal(f.elements.roomName.textContent,'Actual Room');
  assert.equal(f.elements.announcement.textContent,'Hello');
  assert.ok(f.state.roomSyncPromise,'message is still pending');
  f.resolveChat();
  await pending;
  assert.equal(f.state.chatError,false);
});

test('chat failures do not remove seats or stop future retries',async()=>{
  const f=fixture();
  const pending=f.sync();
  await Promise.resolve();
  await Promise.resolve();
  assert.match(f.elements.seats.innerHTML,/You · tap to stand/);
  f.rejectChat();
  await pending;
  await Promise.resolve();
  assert.equal(f.state.chatError,true);
  assert.equal(f.messages.length,1);
  assert.equal(f.state.roomSyncPromise,null);
  assert.match(f.elements.seats.innerHTML,/Open/);
});

test('late chat from previous room cannot mutate the new room',async()=>{
  const f=fixture();
  const pending=f.sync();
  await Promise.resolve();
  await Promise.resolve();
  f.state.roomId='room-two';
  f.state.roomGeneration++;
  f.resolveChat();
  await pending;
  assert.equal(f.state.after,0);
  assert.equal(f.state.chatError,false);
});

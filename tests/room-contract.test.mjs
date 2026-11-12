import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import worker from '../src/worker.js';

const roomId = '00000000-0000-4000-8000-000000000001';
const db = {
  prepare() {
    return {
      bind() { return this; },
      async first() { return null; },
      async all() { return {results: []}; },
    };
  },
};
const environment = {DB: db, VOICE_ENABLED: 'false'};
async function request(method, path, body = null) {
  const req = new Request('https://sura.invalid' + path, {
    method,
    headers: {'Content-Type':'application/json'},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const response = await worker.fetch(req, environment);
  return {status: response.status, body: await response.json()};
}

test('room membership, seat and message mutations reject anonymous users', async () => {
  for (const path of [
    '/api/v1/rooms/' + roomId + '/join',
    '/api/v1/rooms/' + roomId + '/leave',
    '/api/v1/rooms/' + roomId + '/stand',
    '/api/v1/rooms/' + roomId + '/seats/1',
    '/api/v1/rooms/' + roomId + '/messages',
    '/api/v1/rooms/' + roomId + '/settings',
    '/api/v1/rooms/' + roomId + '/kick',
    '/api/v1/rooms/' + roomId + '/block',
    '/api/v1/rooms/' + roomId + '/moderators',
  ]) {
    const result = await request('POST', path, {public_id: '1234567', message: 'test'});
    assert.equal(result.status, 401, path);
    assert.equal(result.body.error, 'login_required', path);
  }
});

test('no private seat chat or voice status without a room membership', async () => {
  const chat = await request('GET', '/api/v1/rooms/' + roomId + '/messages?after=0');
  assert.equal(chat.status, 401);
  const voice = await request('GET', '/api/v1/rooms/' + roomId + '/voice/status');
  assert.equal(voice.status, 401);
});

test('room browsing rejects invalid country filters', async () => {
  for (const suffix of ['?country=BD1', '?scope=unverified', '?home_country=BAD']) {
    const result = await request('GET', '/api/v1/rooms' + suffix);
    assert.equal(result.status, 400);
    assert.equal(result.body.error, 'invalid_room_filter');
  }
});

test('native room UI uses stable view and does not claim a live microphone', () => {
  const room = readFileSync(new URL('../android/app/src/main/java/com/soverixnet/surachat/RoomActivity.java', import.meta.url), 'utf8');
  const home = readFileSync(new URL('../android/app/src/main/java/com/soverixnet/surachat/MainActivity.java', import.meta.url), 'utf8');
  assert.match(room, /private void renderSeatGrid/);
  assert.match(room, /lastSeatSnapshot/);
  assert.match(room, /\/messages\?after=/);
  assert.match(room, /void leaveRoom/);
  assert.match(room, /void loadManagement/);
  assert.match(room, /microphone is not transmitting audio/i);
  assert.match(home, /startActivity\(intent\)/);
  assert.doesNotMatch(home, /private void openRoom\(.*?seatHost/s);
});

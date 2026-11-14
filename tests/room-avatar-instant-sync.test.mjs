import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const web = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const bundled = readFileSync(new URL('../android/app/src/main/assets/sura-chat.html', import.meta.url), 'utf8');
const canonicalMemberId = value => String(value || '').replace(/^SC(?=\d{7,8}$)/, '');

test('staging Android and Royal web use the same corrected room avatar flow', () => {
  assert.equal(web, bundled);
  assert.ok(web.includes('const visibleSeats=a.seats.map('));
  assert.ok(web.includes('E("seats").innerHTML=visibleSeats.map('));
});

test('room seat snapshots retain the latest own profile picture without touching other members', () => {
  const start = web.indexOf('const myPublicId=canonicalMemberId(S.user&&S.user.public_id);');
  const end = web.indexOf('const sig=stableSeatSignature(visibleSeats);', start);
  assert.ok(start > 0 && end > start);
  // Execute the exact avatar-projection expression that is used before rendering.
  const mapper = new Function('a','S','canonicalMemberId', web.slice(start,end) + '\nreturn visibleSeats;');
  const original = [
    { seat_number: 1, public_id: 'SC1234567', avatar_key: 'stale' },
    { seat_number: 2, public_id: '7654321', avatar_key: 'other' },
    { seat_number: 3, public_id: '', avatar_key: '' },
  ];
  const result = mapper({ seats: original },{ user: { public_id: '1234567', avatar_key: 'new' } },canonicalMemberId);
  assert.equal(result[0].avatar_key, 'new');
  assert.equal(result[1], original[1]);
  assert.equal(result[2], original[2]);
  assert.equal(original[0].avatar_key, 'stale');
  assert.equal(mapper({ seats: original }, { user: null }, canonicalMemberId)[0], original[0]);
});

test('successful avatar upload updates the existing occupied seat without rebuilding the grid', () => {
  const start = web.indexOf('async function saveAvatar()');
  const end = web.indexOf('async function loadRoomManage', start);
  assert.ok(start > 0 && end > start);
  const upload = web.slice(start,end);
  assert.match(upload,/requestToken!==S\.token/);
  assert.match(upload,/requestPublicId!==canonicalMemberId\(S\.user&&S\.user\.public_id\)/);
  assert.match(upload,/avatar\.innerHTML=avatarHtml\(ownSeat\)/);
  assert.match(upload,/S\.seatSig=stableSeatSignature\(S\.lastRoomSeats\)/);
  assert.doesNotMatch(upload,/E\("seats"\)\.innerHTML=/);
});

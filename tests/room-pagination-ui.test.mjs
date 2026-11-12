import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';

const web = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const android = readFileSync(new URL('../android/app/src/main/assets/sura-chat.html', import.meta.url), 'utf8');

test('owner Royal design remains identical across the mobile app and website', () => {
 assert.equal(android, web);
 assert.match(web, /Join Live Voice Rooms/);
 assert.match(web, /function roomPager\(\)/);
 assert.match(web, /data-act="moreRooms"/);
});
test('pagination reads the next server page and rejects stale in-flight requests', () => {
 assert.match(web, /offset:String\(offset\)/);
 assert.match(web, /searchSeq!==roomSearchSeq/);
 assert.match(web, /S\.roomLoadingMore=true/);
 assert.match(web, /S\.roomNextOffset=Number\.isSafeInteger\(response\.next_offset\)/);
});
test('every non-empty inline JavaScript block parses', () => {
 const scripts = [...web.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
 assert.ok(scripts.length > 0);
 for (const [, source] of scripts) if (source.trim()) assert.doesNotThrow(() => new Script(source));
});

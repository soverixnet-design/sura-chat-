import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../web/index.html',import.meta.url),'utf8');
const asset=readFileSync(new URL('../android/app/src/main/assets/sura-chat.html',import.meta.url),'utf8');
const android=readFileSync(new URL('../android/app/src/main/java/com/soverixnet/surachat/RoyalWebActivity.java',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../android/app/src/main/AndroidManifest.xml',import.meta.url),'utf8');

test('HTML and Android bundle are byte-identical',()=>assert.equal(html,asset));
test('voice uses a pinned SDK and server-mediated authenticated token',()=>{
  assert.match(html, /realtimekit@2\.0\.4\/dist\/browser\.js/);
  assert.match(html, /\/voice\/status/);
  assert.match(html, /\/voice\/token/);
  assert.match(html, /async function joinVoice/);
  assert.match(html, /meeting\.join\(\)/);
  assert.match(html, /meeting\.self\.enableAudio\(\)/);
  assert.match(html, /meeting\.self\.disableAudio\(\)/);
  assert.match(html, /defaults:\{audio:false,video:false\}/);
  assert.match(html, /await stopVoice\(\)/);
  assert.doesNotMatch(html, /RTK_API_TOKEN/);
});
test('microphone permission is restricted to trusted bundled origin and audio capture',()=>{
  assert.match(manifest, /android\.permission\.RECORD_AUDIO/);
  assert.doesNotMatch(manifest, /android\.permission\.CAMERA/);
  assert.match(android, /appassets\.androidplatform\.net/);
  assert.match(android, /RESOURCE_AUDIO_CAPTURE/);
  assert.match(android, /request\.deny\(\)/);
  assert.match(android, /onRequestPermissionsResult/);
  assert.match(android, /BuildConfig\.DEBUG/);
});

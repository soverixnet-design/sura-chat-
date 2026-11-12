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
  assert.match(html, /active\.self\.enableAudio\(\)/);
  assert.match(html, /active\.self\.disableAudio\(\)/);
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

test('remote audio renderer is registered, mounted and cleaned up on room leave',()=>{
  assert.match(html, /<rtk-participants-audio id="suraVoiceAudio"/);
  assert.match(html, /realtimekit-ui@2\.0\.3\/loader\/index\.es2017\.js/);
  assert.match(html, /module\.defineCustomElements\(\)/);
  assert.match(html, /customElements\.whenDefined\("rtk-participants-audio"\)/);
  assert.match(html, /audio\.meeting=meeting/);
  assert.match(html, /audio\.meeting=undefined/);
  assert.match(html, /await Promise\.all\(\[loadVoiceSdk\(\),loadVoiceUi\(\)\]\)/);
  assert.match(html, /S\.voice\.generation\+\+/);
  assert.match(html, /stillCurrent\(\)/);
});

test('real RealtimeKit lifecycle events update voice status and clean up',()=>{
  assert.match(html, /id="voiceConnection"/);
  assert.match(html, /mediaConnectionUpdate/);
  assert.match(html, /roomLeft/);
  assert.match(html, /S\.voice\.meeting===liveMeeting/);
  assert.match(html, /S\.voice\.roomId===roomId/);
  assert.match(html, /endLocalRoom\("Voice session "/);
  assert.match(html, /showVoiceTransports\(transports\)/);
  assert.match(html, /voiceNet\("Microphone error/);
  assert.match(html, /Tap Join Voice to listen/);
});

test('WebView uses bundled first-party HTTPS asset loader for WebRTC',()=>{
  const gradle=readFileSync(new URL('../android/app/build.gradle',import.meta.url),'utf8');
  assert.match(gradle, /androidx\.webkit:webkit:1\.18\.0/);
  assert.match(android, /WebViewAssetLoader\.Builder\(\)/);
  assert.match(android, /addPathHandler\("\/assets\/", new WebViewAssetLoader\.AssetsPathHandler\(this\)\)/);
  assert.match(android, /https:\/\/appassets\.androidplatform\.net\/assets\/sura-chat\.html/);
  assert.match(android, /shouldInterceptRequest\(request\.getUrl\(\)\)/);
  assert.match(android, /webView\.loadUrl\(APP_URL\)/);
  assert.doesNotMatch(android, /loadDataWithBaseURL/);
  assert.match(android, /setAllowFileAccessFromFileURLs\(false\)/);
  assert.match(android, /setAllowUniversalAccessFromFileURLs\(false\)/);
  assert.match(android, /isForMainFrame/);
  assert.match(android, /!APP_URL\.equals/);
  assert.match(android, /onRenderProcessGone/);
});

test('entry JavaScript avoids ES2020 nullish coalescing / optional chaining on older WebViews',()=>{
  const begin=html.indexOf('<script>');
  const end=html.lastIndexOf('</script>');
  assert.ok(begin>=0&&end>begin,'inline application script exists');
  const scripts=[html.slice(begin,end)];
  assert.ok(scripts.length>0);
  for(const block of scripts){
    assert.ok(!block.includes('?'+'.'),'optional chaining breaks older Android WebView');
    assert.ok(!block.includes('?'+'?'),'nullish coalescing breaks older Android WebView');
  }
});


test('Royal room contains owner/admin management backed by protected SURA endpoints',()=>{
 assert.match(html,/id="roomManageButton"/);
 assert.match(html,/id="roomManagePanel"/);
 assert.match(html,/async function loadRoomManage\(openPanel\)/);
 assert.match(html,/\/manage"/);
 assert.match(html,/room_moderator_required/);
 assert.match(html,/my_permission==="owner"/);
 assert.match(html,/roomSettingsForm/);
 assert.match(html,/\/settings","POST"/);
 assert.match(html,/\/moderators","POST"/);
 assert.match(html,/public_id:id,enabled/);
 assert.match(html,/\/seats\/"\+number\+"\/"\+action/);
 assert.match(html,/roomMemberAction/);
 assert.match(html,/data-act="roomAdminToggle"/);
 assert.match(html,/protectedUser=isSelf\|\|m.permission==="owner"/);
});

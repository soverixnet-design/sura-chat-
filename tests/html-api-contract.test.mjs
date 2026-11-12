import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../android/app/src/main/assets/sura-chat.html', import.meta.url), 'utf8');
const web = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const java = readFileSync(new URL('../android/app/src/main/java/com/soverixnet/surachat/RoyalWebActivity.java', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');

test('the bundled design matches the web source', () => {
    assert.equal(html, web);
    assert.match(html, /SURA CHAT/);
    assert.match(html, /class="card banner"/);
});
test('no demo coin spending, fake users or randomized winners', () => {
    for (const bad of ['coins:328500', "['Luna'", 'Google (demo)', 'Apple (demo)', 'Math.random()', 'localStorage.setItem', 'onclick="buy(']) {
        assert.equal(html.includes(bad), false, 'demo retained: ' + bad);
    }
});
test('auth, real rooms, messages, profile and moments use SURA API', () => {
    for (const endpoint of [
        '/api/v1/auth/login', '/api/v1/auth/signup', '/api/v1/rooms',
        '/api/v1/messages', '/api/v1/me/profile', '/api/v1/moments'
    ]) assert.ok(html.includes(endpoint), 'missing ' + endpoint);
    assert.ok(html.includes('id="voiceLabel"'));
    assert.ok(html.includes('SURA backend'));
});
test('the Android debug launcher is local and production fails closed', () => {
    assert.ok(manifest.includes('RoyalWebActivity'));
    assert.ok(java.includes('BuildConfig.DEBUG'));
    assert.ok(java.includes('webView.loadUrl(APP_URL)'));
    assert.ok(java.includes('WebViewAssetLoader'));
    assert.ok(!java.includes('loadDataWithBaseURL'));
    assert.ok(!java.includes('setAllowUniversalAccessFromFileURLs(true)'));
});


test('SURA login displays a persistent actionable server error and proper form',()=>{
 assert.match(html, /id="authIssue"/);
 assert.match(html, /function authMessage\(/);
 assert.match(html, /function showAuthIssue\(/);
 assert.match(html, /invalid_credentials/);
 assert.match(html, /account_exists/);
 assert.match(html, /network_unavailable/);
 assert.match(html, /autocomplete="current-password"/);
 assert.match(html, /pattern="\[0-9\]\{8\}"/);
 assert.match(html, /S\.signup=false/);
 assert.match(html, /typeof r\.token!=="string"/);
});


test('room entry does not block on first sync and retries automatically',()=>{
 assert.match(html, /async function enter\(id\)/);
 assert.match(html, /S\.poll=setInterval/);
 assert.match(html, /void syncRoom\(\)\.catch/);
 assert.match(html, /Room loading: /);
 assert.match(html, /roomSyncPromise:null,roomGeneration:0/);
 assert.match(html, /if\(S\.roomSyncPromise\)return S\.roomSyncPromise/);
 assert.match(html, /task\.then\(\(\)=>\{if\(S\.roomSyncPromise===task\)/);
 assert.match(html, /generation!==S\.roomGeneration/);
});
test('room seat layout ignores timestamp churn and messages dedupe',()=>{
 assert.match(html, /function stableSeatSignature\(seats\)/);
 assert.match(html, /String\(s\.public_id\|\|""\)/);
 assert.match(html, /if\(sig!==S\.seatSig\)/);
 assert.match(html, /if\(messageId<=S\.after\)continue/);
});
test('room exit closes immediately, retries server exit and avoids stale same-room exit',()=>{
 assert.match(html, /async function leave\(targetTab="rooms"\)/);
 assert.match(html, /S\.roomId="";S\.roomGeneration\+\+/);
 assert.match(html, /void stopVoice\(\)/);
 assert.match(html, /if\(S\.roomId!==id&&S\.token===session\)/);
 assert.match(html, /if\(S\.roomId\)void leave\(el\.dataset\.value\);else go/);
});


test('SURA profile photo uses real R2 WebP endpoint and in-room seat avatar updates',()=>{
 assert.match(html, /id="avatarFile"/);
 assert.match(html, /data-act="saveAvatar"/);
 assert.match(html, /function avatarUrl\(user\)/);
 assert.match(html, /\/api\/v1\/users\/"\+encodeURIComponent\(id\)\+"\/avatar/);
 assert.match(html, /async function makeAvatarWebp\(file\)/);
 assert.match(html, /canvas\.toBlob\(resolve,"image\/webp",quality\)/);
 assert.match(html, /blob\.size<=256000/);
 assert.match(html, /async function saveAvatar\(\)/);
 assert.match(html, /\/api\/v1\/me\/avatar/);
 assert.match(html, /"Content-Type":"image\/webp"/);
 assert.match(html, /S\.user\.avatar_key=result\.avatar_key/);
 assert.match(html, /String\(s\.avatar_key\|\|""\)/);
 assert.match(html, /avatarHtml\(s\)/);
 assert.match(java, /onShowFileChooser\(/);
 assert.match(java, /ACTION_GET_CONTENT/);
 assert.match(java, /AVATAR_PICKER_CODE/);
 assert.match(java, /pendingAvatarPicker\.onReceiveValue\(null\)/);
 assert.match(java, /"content"\.equals\(selected\.getScheme\(\)\)/);
 assert.match(java, /mime\.startsWith\("image\/"\)/);
 assert.doesNotMatch(java, /ACTION_GET_MULTIPLE_CONTENTS/);
});


test('late 401 from previous bearer cannot clear a new SURA session',()=>{
 assert.match(html,/const requestToken=S\.token/);
 assert.match(html,/r\.status===401&&requestToken&&S\.token===requestToken/);
 assert.match(html,/j\.error==="session_expired"\|\|j\.error==="login_required"/);
});
test('logout leaves room before revoking bearer',()=>{
 assert.match(html,/if\(S\.roomId\)await leave\(null\)/);
 assert.match(html,/await api\("\/api\/v1\/auth\/logout","POST",\{\}\)/);
});
test('Android back closes management panel before room and exits login activity',()=>{
 assert.match(html,/if\(!E\("roomManagePanel"\)\.hidden\)\{E\("roomManagePanel"\)\.hidden=true;return true;\}/);
 assert.match(html,/if\(!E\("login"\)\.hidden\)return false/);
});

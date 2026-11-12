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
    for (const bad of ['coins:328500', "['Luna'", 'Google (demo)', 'Apple (demo)', 'Math.random()', 'onclick="buy(']) {
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

test('SURA session persists only opted-in short-lived bearer token, not password or demo coins',()=>{
 assert.match(html,/const AUTH_STORAGE_KEY="sura.auth.session.v1"/);
 assert.match(html,/function readSavedLogin\(\)/);
 assert.match(html,/localStorage.getItem\(AUTH_STORAGE_KEY\)/);
 assert.match(html,/localStorage.setItem\(AUTH_STORAGE_KEY,JSON.stringify\(\{token,expires_at:/);
 assert.match(html,/function forgetSavedLogin\(\)/);
 assert.match(html,/name="remember" checked/);
 assert.match(html,/if\(d.get\("remember"\)==="on"\)rememberLogin\(r.token,r.expires_in\);else forgetSavedLogin\(\)/);
 assert.match(html,/async function restoreSavedLogin\(\)/);
 assert.match(html,/fetch\(API\+"\/api\/v1\/me"/);
 assert.match(html,/if\(res.status===401\)\{forgetSavedLogin\(\);throw Error\("session_expired"\)/);
 assert.match(html,/showLogin\(true\)/);
 assert.match(html,/showLogin\(\);void restoreSavedLogin\(\)/);
 assert.match(java,/settings.setDomStorageEnabled\(true\)/);
 assert.doesNotMatch(html,/localStorage\.setItem\(["']password/);
 assert.doesNotMatch(html,/localStorage\.setItem\(["']coins/);
});


test('session persistence retains late-401 and safe room logout protections',()=>{
 assert.match(html,/const requestToken=S\.token/);
 assert.match(html,/r\.status===401&&requestToken&&S\.token===requestToken/);
 assert.match(html,/showLogin\(true\);showAuthIssue\("Session expired/);
 assert.match(html,/if\(S\.roomId\)await leave\(null\)/);
 assert.match(html,/async function leave\(targetTab="rooms"\)/);
 assert.match(html,/S\.authGeneration\+\+/);
});


test('user-provided SURA Royal mobile reference layout replaces assistant-created home',()=>{
 const home=html.slice(html.indexOf('if(S.tab==="home")x.innerHTML='),html.indexOf('else if(S.tab==="rooms")'));
 assert.match(home,/Join Live Voice Rooms/);
 assert.match(home,/Talk · Connect · Make Friends/);
 assert.match(home,/Featured Voice Rooms/);
 assert.match(home,/Trending Hosts/);
 assert.match(home,/refImg\("crown",88\)/);
 assert.doesNotMatch(home,/Find your people/);
 assert.doesNotMatch(home,/class="big"/);
 assert.match(html,/const REF_ICONS=\{/);
 assert.match(html,/id="headerAvatar"/);
 assert.match(html,/width:100dvh|height:100dvh/);
 assert.match(html,/#main\{flex:1 1 0%/);
 assert.match(html,/#room \.rbar\{flex:0 0 auto;display:grid;grid-template-columns:repeat\(3/);
});
test('reference room has six real or explicitly disabled actions, not fake gifts or micropayments',()=>{
 assert.match(html,/data-act="messageFocus"/);
 assert.match(html,/data-act="roomQuickMenu"/);
 assert.match(html,/data-act="roomRewards"/);
 assert.match(html,/data-act="roomGiftPreview"/);
 assert.match(html,/data-act="leave"/);
 assert.match(html,/Preview only · Gift sending is not enabled on staging/);
 assert.match(html,/Room rewards are not active/);
 assert.match(html,/room_moderator_required/);
 assert.doesNotMatch(html,/coins:328500/);
 assert.doesNotMatch(html,/var U=\[\['Luna'/);
 assert.doesNotMatch(html,/function play\(\)/);
});

test('all embedded user reference icons resolve, including announcement megaphone',()=>{
 assert.doesNotMatch(html,/src="undefined"/);
 assert.match(html,/class="ref-ann-icon"/);
 assert.match(html,/SURA user-supplied Royal HTML\/mobile-fit styling/);
});


test('room discovery search and country filter use real SURA room results', () => {
  assert.match(html, /id="roomSearch"/);
  assert.match(html, /id="roomCountry"/);
  assert.match(html, /id="roomResults"/);
  assert.match(html, /data-act="applyCountry"/);
  assert.match(html, /data-act="myCountry"/);
  assert.match(html, /data-act="allCountries"/);
  assert.match(html, /filters\.set\("home_country",homeCountry\)/);
  assert.match(html, /filters\.set\("country",S\.country\)/);
  assert.match(html, /S\.roomSearch=String\(e\.target\.value\|\|""\)/);
  assert.match(html, /String\(r\.name\|\|""\)\.toLocaleLowerCase\(\)\.includes\(search\)/);
  assert.doesNotMatch(html, /coins:328500/);
});


test('room member popup loads actual profile and leaves voice active until message action', () => {
  assert.match(html, /id="memberProfileSheet"/);
  assert.match(html, /id="memberProfileBody"/);
  assert.match(html, /async function openMemberProfile\(publicId\)/);
  assert.match(html, /await api\("\/api\/v1\/users\/"\+encodeURIComponent\(id\)\)/);
  assert.match(html, /else if\(a==="member"\)await openMemberProfile\(el\.dataset\.id\)/);
  assert.match(html, /else if\(a==="closeMemberProfile"\)closeMemberProfile\(\)/);
  assert.match(html, /else if\(a==="memberMessage"\)/);
  assert.match(html, /if\(!E\("memberProfileSheet"\)\.hidden\)\{closeMemberProfile\(\);return true;\}/);
  assert.doesNotMatch(html, /confirm\(r\.user\.display_name/);
});

test('background room presence and late navigation responses stay safe', () => {
  assert.match(html, /navigationSeq:0/);
  assert.match(html, /requestSeq=\+\+S\.navigationSeq/);
  assert.match(html, /requestToken!==S\.token\|\|requestSeq!==S\.navigationSeq/);
  assert.match(html, /if\(a==="authTab"\)\{S\.authGeneration\+\+/);
  assert.match(html, /document\.addEventListener\("visibilitychange"/);
  assert.match(html, /if\(document\.hidden\)\{/);
  assert.match(html, /clearInterval\(S\.poll\);S\.poll=null;/);
  assert.match(html, /void heartbeat\(\); \/\/ Validate membership immediately after app resumes/);
  assert.match(html, /if\(!S\.heartbeatUnsupported&&!S\.heartbeatTimer\)/);
});

test('Moments, inbox and DM show real member profiles without fictional user data', () => {
  assert.match(html, /class="social-author" data-act="member"/);
  assert.match(html, /avatar_key:m\.author_avatar_key/);
  assert.match(html, /id="findMember"/);
  assert.match(html, /pattern="\[0-9\]\{7,8\}"/);
  assert.match(html, /class="card thread-card"/);
  assert.match(html, /class="btn dm-member-profile"/);
  assert.match(html, /form\.id==="findMember"\)await openMemberProfile/);
  assert.match(html, /await api\("\/api\/v1\/users\/"\+encodeURIComponent\(id\)\)/);
});

test('member safety is accessible on actual member profiles and room chat', () => {
  assert.match(html, /data-act="memberBlock"/);
  assert.match(html, /data-act="memberReport"/);
  assert.match(html, /id="memberReportForm"/);
  assert.match(html, /form\.id==="memberReportForm"/);
  assert.match(html, /\/api\/v1\/me\/blocks/);
  assert.match(html, /\/api\/v1\/reports/);
  assert.match(html, /context_type:"profile"/);
  assert.match(html, /className="chat-member-name"/);
  assert.match(html, /async function openDm\(id\)\{if\(!\/\^\\d\{7,8\}\$\//);
});

test('rooms search across SURA server and profile country is editable',()=>{
  assert.match(html, /limit:tab==="home"\?"5":"50"/);
  assert.match(html, /filters\.set\("q",S\.roomSearch\.trim\(\)\)/);
  assert.match(html, /q:query/);
  assert.match(html, /setTimeout\(async\(\)=>\{/);
  assert.match(html, /roomSearchSeq/);
  assert.match(html, /Search all live rooms/);
  assert.match(html, /name="country_code"/);
  assert.match(html, /country_code:String\(d\.get\("country_code"\)\|\|""\)\.trim\(\)\.toUpperCase\(\)/);
});

test('moderation UI only uses verified backend data and keeps Royal reference layout',()=>{
 assert.match(html,/id="editProfile"/);
 assert.match(html,/Review Reports \(Staff\)/);
 assert.match(html,/data-value="reports"/);
 assert.match(html,/data-value="blocked"/);
 assert.match(html,/\/api\/v1\/me\/reports/);
 assert.match(html,/\/api\/v1\/me\/blocks/);
 assert.match(html,/\/api\/v1\/staff\/access/);
 assert.match(html,/\/api\/v1\/staff\/reports\?status=/);
 assert.match(html,/class="form report-review"/);
 assert.match(html,/form\.classList\.contains\("report-review"\)/);
 assert.match(html,/if\(!access\.moderator\)throw Error/);
 assert.match(html,/if\(!S\.moderator\)throw Error/);
 assert.match(html,/S\.moderator=false/);
});

test('account security is server-backed and contains no demo recovery claims', () => {
 assert.match(html,/id="changePasswordForm"/);
 assert.match(html,/id="revokeOthersForm"/);
 assert.match(html,/\/api\/v1\/auth\/change-password/);
 assert.match(html,/\/api\/v1\/auth\/revoke-other-sessions/);
 assert.match(html,/name="current_password"/);
 assert.match(html,/name="confirm_password"/);
 assert.match(html,/Passwords do not match/);
 assert.match(html,/Email recovery is not available yet/);
});

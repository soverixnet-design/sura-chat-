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

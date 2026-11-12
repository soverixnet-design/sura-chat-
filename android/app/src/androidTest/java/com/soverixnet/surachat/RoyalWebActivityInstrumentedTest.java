package com.soverixnet.surachat;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/** An Android-emulator runtime test; not a mock WebView or a token-only voice test. */
@RunWith(AndroidJUnit4.class)
public final class RoyalWebActivityInstrumentedTest {
    @Rule
    public final ActivityScenarioRule<RoyalWebActivity> activityRule =
        new ActivityScenarioRule<>(RoyalWebActivity.class);

    private static WebView findWebView(View node) {
        if (node instanceof WebView) return (WebView) node;
        if (node instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) node;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView found = findWebView(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private String evaluate(String script) throws Exception {
        final CountDownLatch latch = new CountDownLatch(1);
        final AtomicReference<String> result = new AtomicReference<>();
        activityRule.getScenario().onActivity(activity -> {
            WebView webView = findWebView(activity.getWindow().getDecorView());
            assertNotNull("RoyalWebActivity must contain a WebView", webView);
            webView.evaluateJavascript(script, value -> {
                result.set(value);
                latch.countDown();
            });
        });
        assertTrue("WebView evaluateJavascript timeout", latch.await(8, TimeUnit.SECONDS));
        return result.get();
    }

    @Test
    public void launchesBundledRoyalLoginFromSecureAppAssetsOrigin() throws Exception {
        final String script =
            "(function(){return JSON.stringify({" +
            "url:location.href," +
            "secure:window.isSecureContext," +
            "hasLogin:!!document.querySelector('#login')," +
            "loginVisible:!!document.querySelector('#login')&&!document.querySelector('#login').hidden," +
            "hasAuthForm:!!document.querySelector('#authForm')," +
            "backHandler:typeof window.suraBack==='function'," +
            "voiceRenderer:!!document.querySelector('rtk-participants-audio')," +
            "microphoneApi:!!navigator.mediaDevices&&typeof navigator.mediaDevices.getUserMedia==='function'" +
            "})})()";

        JSONObject state = null;
        for (int attempt = 0; attempt < 35; attempt++) {
            String raw = evaluate(script);
            try {
                Object parsed = new JSONTokener(raw).nextValue();
                if (parsed instanceof String) {
                    state = new JSONObject((String) parsed);
                    if (state.optBoolean("hasAuthForm", false)) break;
                }
            } catch (Exception ignored) {
                // A WebView still navigating might return null or incomplete state.
            }
            Thread.sleep(500);
        }
        assertNotNull("Royal HTML has not initialized in 35 retries", state);
        Log.i("SURA_ANDROID_SMOKE", state.toString());
        assertEquals("https://appassets.androidplatform.net/assets/sura-chat.html",
            state.getString("url"));
        assertTrue("WebView appassets origin must be a secure context",
            state.getBoolean("secure"));
        assertTrue("Royal login section should exist", state.getBoolean("hasLogin"));
        assertTrue("Login must be visible", state.getBoolean("loginVisible"));
        assertTrue("Login form must be rendered by real JavaScript",
            state.getBoolean("hasAuthForm"));
        assertTrue("Device back callback must be wired",
            state.getBoolean("backHandler"));
        assertTrue("RealtimeKit remote audio renderer must be in room DOM",
            state.getBoolean("voiceRenderer"));
        assertTrue("WebRTC microphone API should be supported in Android WebView",
            state.getBoolean("microphoneApi"));
    }

    private boolean waitForJs(String script, int retries) throws Exception {
        for (int attempt=0;attempt<retries;attempt++) {
            if ("true".equals(evaluate(script))) return true;
            Thread.sleep(500);
        }
        return false;
    }

    @Test
    public void stagingSignupLogoutLoginAndRoomsWorkInRealWebView() throws Exception {
        // This is a real staging API integration, not a simulated fetch response.
        // The test account is synthetic and identified for targeted D1 cleanup.
        String email = "suraqa-auth-"+
            UUID.randomUUID().toString().replace("-", "").substring(0, 12)+"@example.invalid";
        String pin = String.format(Locale.US, "%08d",new SecureRandom().nextInt(100000000));
        Log.i("SURA_QA_ACCOUNT_TO_CLEAN",email);
        assertTrue("Royal login form not ready",
            waitForJs("!!document.querySelector('#authForm')",30));

        String switchSignup =
            "(function(){var b=document.querySelector('[data-act=authTab][data-value=signup]');"+
            "if(!b)return false;b.click();"+
            "return !!document.querySelector('#authForm input[name=display_name]');})()";
        assertEquals("true",evaluate(switchSignup));

        String signupSubmit =
            "(function(){var f=document.getElementById('authForm');"+
            "f.elements.namedItem('display_name').value='SURA Auto QA';"+
            "f.elements.namedItem('country_code').value='BD';"+
            "f.elements.namedItem('email').value='"+email+"';"+
            "f.elements.namedItem('password').value='"+pin+"';"+
            "return f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()";
        evaluate(signupSubmit);
        boolean signupOk = waitForJs(
            "(function(){var login=document.getElementById('login');"+
            "return login.hidden&&!!document.querySelector('#main .banner');})()",60);
        if(!signupOk) {
            String error = evaluate("(function(){return document.querySelector('#authIssue')?.textContent||"+
                "document.querySelector('#toast')?.textContent||'signup timed out';})()");
            throw new AssertionError("Real staging signup did not open Royal home: "+error);
        }
        Log.i("SURA_ANDROID_AUTH", "PASS synthetic signup and Royal home rendering");

        // Confirm profile can be fetched using the freshly issued bearer session.
        evaluate("(function(){var p=document.querySelector('[data-act=tab][data-value=profile]');"+
            "if(p)p.click();return true;})()");
        assertTrue("Authenticated profile endpoint/page did not render",
            waitForJs("!!document.querySelector('#editProfile')",40));

        // Test explicit logout and subsequent email + same PIN login in the
        // actual Android WebView, not only a curl-based Worker token call.
        evaluate("(function(){var b=document.querySelector('[data-act=logout]');"+
            "if(b)b.click();return true;})()");
        assertTrue("Logout did not show the Login form",
            waitForJs("(function(){var n=document.getElementById('login');"+
                "return !n.hidden&&!!document.querySelector('#authForm');})()",30));

        String loginSubmit =
            "(function(){var f=document.getElementById('authForm');"+
            "f.elements.namedItem('email').value='"+email+"';"+
            "f.elements.namedItem('password').value='"+pin+"';"+
            "return f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));})()";
        evaluate(loginSubmit);
        boolean loggedIn = waitForJs(
            "(function(){return document.getElementById('login').hidden&&"+
            "!!document.querySelector('#main .banner');})()",60);
        if(!loggedIn) {
            String error = evaluate("(function(){var e=document.querySelector('#authIssue');"+
                "return e&&e.textContent||'login timed out';})()");
            throw new AssertionError("Real staging email/password LOGIN failed: "+error);
        }

        evaluate("(function(){var r=document.querySelector('[data-act=tab][data-value=rooms]');"+
            "if(r)r.click();return true;})()");
        assertTrue("Rooms API page failed after login",
            waitForJs("!!document.querySelector('#createRoom')",40));
        Log.i("SURA_ANDROID_AUTH","PASS real WebView signup, logout, login, rooms and profile");
    }
}

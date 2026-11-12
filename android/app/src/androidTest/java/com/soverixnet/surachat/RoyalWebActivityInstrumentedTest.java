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
}

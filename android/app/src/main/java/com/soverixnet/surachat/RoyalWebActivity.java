package com.soverixnet.surachat;

import android.app.Activity;
import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.os.Build;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Debug-only Royal SURA staging app.
 * HTML is bundled locally. Auth, profiles, rooms, chat and moments use SURA API.
 * RealtimeKit Web Core is staged with mic permission gating; end-to-end audio
 * and background operation are not yet verified. No purchasing or production.
 */
public final class RoyalWebActivity extends Activity {
    private static final int AUDIO_PERMISSION_CODE = 2046;
    private WebView webView;
    private PermissionRequest pendingAudioRequest;

    // Only the local, bundled design may request AUDIO_CAPTURE. Never grant
    // camera, protected media or untrusted iframe origins.
    private void handleWebAudioPermission(PermissionRequest request) {
        if (webView == null || request == null) return;
        boolean trusted = request.getOrigin() != null &&
            "https".equals(request.getOrigin().getScheme()) &&
            "appassets.androidplatform.net".equals(request.getOrigin().getHost());
        String[] resources = request.getResources();
        boolean audioOnly = resources != null && resources.length == 1 &&
            PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resources[0]);
        if (!trusted || !audioOnly) {
            request.deny();
            return;
        }
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            if (pendingAudioRequest != null) pendingAudioRequest.deny();
            pendingAudioRequest = request;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, AUDIO_PERMISSION_CODE);
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != AUDIO_PERMISSION_CODE) return;
        PermissionRequest pending = pendingAudioRequest;
        pendingAudioRequest = null;
        if (pending == null) return;
        if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            pending.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pending.deny();
        }
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(18, 10, 42));
        getWindow().setNavigationBarColor(Color.rgb(18, 10, 42));
        if (!BuildConfig.DEBUG) {
            showError("SURA CHAT production API and release security checks are not configured.");
            return;
        }
        try (InputStream input = getAssets().open("sura-chat.html");
             ByteArrayOutputStream buffer = new ByteArrayOutputStream()) {
            byte[] chunk = new byte[8192];
            int read;
            while ((read = input.read(chunk)) >= 0) {
                buffer.write(chunk, 0, read);
            }
            String content = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            webView = new WebView(this);
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(false);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            // RealtimeKit starts playback only after a deliberate Voice button press.
            // Remote streams may auto-play after joining an authenticated meeting.
            settings.setMediaPlaybackRequiresUserGesture(false);
            webView.setWebViewClient(new WebViewClient());
            webView.setWebChromeClient(new WebChromeClient() {
                @Override public void onPermissionRequest(PermissionRequest request) {
                    runOnUiThread(() -> handleWebAudioPermission(request));
                }
                @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                    if (request == pendingAudioRequest) pendingAudioRequest = null;
                }
            });
            setContentView(webView);
            webView.loadDataWithBaseURL(
                "https://appassets.androidplatform.net/",
                content, "text/html", "UTF-8", null
            );
        } catch (Exception e) {
            showError("Unable to open SURA CHAT design.");
        }
    }

    private void showError(String message) {
        TextView error = new TextView(this);
        error.setGravity(Gravity.CENTER);
        error.setBackgroundColor(Color.rgb(18, 10, 42));
        error.setTextColor(Color.WHITE);
        error.setText(message);
        setContentView(error);
    }

    @Override public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }
        webView.evaluateJavascript(
            "(function(){return window.suraBack ? window.suraBack() : false;})()",
            result -> {
                if ("false".equals(result) || "null".equals(result)) finish();
            }
        );
    }

    @Override protected void onDestroy() {
        if (pendingAudioRequest != null) {
            pendingAudioRequest.deny();
            pendingAudioRequest = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

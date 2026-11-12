package com.soverixnet.surachat;

import android.app.Activity;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.Manifest;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.RenderProcessGoneDetail;
import androidx.webkit.WebViewAssetLoader;
import androidx.webkit.WebViewClientCompat;
import android.os.Bundle;
import android.graphics.Color;
import android.view.Gravity;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.TextView;

/**
 * Debug-only Royal SURA staging app.
 * HTML is bundled locally. Auth, profiles, rooms, chat and moments use SURA API.
 * RealtimeKit Web Core is staged with mic permission gating; end-to-end audio
 * and background operation are not yet verified. No purchasing or production.
 */
public final class RoyalWebActivity extends Activity {
    private static final int AUDIO_PERMISSION_CODE = 2046;
    private static final int AVATAR_PICKER_CODE = 2047;
    private static final String APP_URL =
        "https://appassets.androidplatform.net/assets/sura-chat.html";
    private WebView webView;
    private PermissionRequest pendingAudioRequest;
    private ValueCallback<Uri[]> pendingAvatarPicker;

    // Only the local, bundled design may request AUDIO_CAPTURE. Never grant
    // camera, protected media or untrusted iframe origins.
    private void handleWebAudioPermission(PermissionRequest request) {
        if (request == null) return;
        if (webView == null || isFinishing() || isDestroyed()) {
            request.deny();
            return;
        }
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

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if (requestCode != AVATAR_PICKER_CODE) return;
        ValueCallback<Uri[]> callback = pendingAvatarPicker;
        pendingAvatarPicker = null;
        if (callback == null) return;
        Uri selected = resultCode == RESULT_OK && data != null ? data.getData() : null;
        if (selected == null || !"content".equals(selected.getScheme())) {
            callback.onReceiveValue(null);
            return;
        }
        String mime = getContentResolver().getType(selected);
        if (mime == null || !mime.startsWith("image/")) {
            callback.onReceiveValue(null);
            return;
        }
        callback.onReceiveValue(new Uri[]{selected});
    }

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(18, 10, 42));
        getWindow().setNavigationBarColor(Color.rgb(18, 10, 42));
        if (!BuildConfig.DEBUG) {
            showError("SURA CHAT production API and release security checks are not configured.");
            return;
        }
        try {
            // Serve bundled HTML as a first-party HTTPS page. Unlike a data: page,
            // this provides a stable secure origin for WebRTC and getUserMedia.
            final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();
            webView = new WebView(this);
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true); // Scoped SURA session token in app-private WebView origin.
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(true); // Required for explicit user-selected gallery content:// URI only.
            settings.setAllowFileAccessFromFileURLs(false);
            settings.setAllowUniversalAccessFromFileURLs(false);
            settings.setJavaScriptCanOpenWindowsAutomatically(false);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            // The user explicitly taps Join Voice before any remote audio starts.
            // Audio elements must be allowed to render incoming participant streams.
            settings.setMediaPlaybackRequiresUserGesture(false);
            webView.setWebViewClient(new WebViewClientCompat() {
                @Override public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request
                ) {
                    return assetLoader.shouldInterceptRequest(request.getUrl());
                }

                @Override public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request
                ) {
                    // JavaScript may fetch HTTPS API and RealtimeKit resources but may
                    // not navigate the app's top frame to an external website.
                    return request.isForMainFrame()
                        && !APP_URL.equals(request.getUrl().toString());
                }

                @Override public boolean onRenderProcessGone(
                    WebView view, RenderProcessGoneDetail detail
                ) {
                    // A crashed WebView is not usable; avoid a permanent blank screen.
                    if (view != webView) return false;
                    if (pendingAudioRequest != null) {
                        pendingAudioRequest.deny();
                        pendingAudioRequest = null;
                    }
                    webView = null;
                    if (pendingAvatarPicker != null) {
                        pendingAvatarPicker.onReceiveValue(null);
                        pendingAvatarPicker = null;
                    }
                    view.destroy();
                    showError("SURA CHAT browser restarted. Reopen the app to reconnect.");
                    return true;
                }
            });
            webView.setWebChromeClient(new WebChromeClient() {
                @Override public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> callback,
                    WebChromeClient.FileChooserParams params) {
                    if (webView != RoyalWebActivity.this.webView ||
                        !APP_URL.equals(webView.getUrl()) || isFinishing() || isDestroyed()) {
                        callback.onReceiveValue(null);
                        return true;
                    }
                    if (pendingAvatarPicker != null) pendingAvatarPicker.onReceiveValue(null);
                    pendingAvatarPicker = callback;
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.setType("image/*");
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    try {
                        startActivityForResult(Intent.createChooser(intent, "Choose profile photo"), AVATAR_PICKER_CODE);
                        return true;
                    } catch (ActivityNotFoundException e) {
                        pendingAvatarPicker = null;
                        callback.onReceiveValue(null);
                        return true;
                    }
                }
                @Override public void onPermissionRequest(PermissionRequest request) {
                    runOnUiThread(() -> handleWebAudioPermission(request));
                }
                @Override public void onPermissionRequestCanceled(PermissionRequest request) {
                    if (request == pendingAudioRequest) pendingAudioRequest = null;
                }
            });
            setContentView(webView);
            webView.loadUrl(APP_URL);
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
        if (pendingAvatarPicker != null) {
            pendingAvatarPicker.onReceiveValue(null);
            pendingAvatarPicker = null;
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}

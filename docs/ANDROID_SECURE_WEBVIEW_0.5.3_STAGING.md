# SURA CHAT v0.5.3 — secure local HTML origin for Android WebRTC

**Status:** staging, debug only — not published to Play Store.

## Why
The Android entry Activity previously called `loadDataWithBaseURL("https://appassets.androidplatform.net/", html, ...)`. Android recommends `androidx.webkit.WebViewAssetLoader` to serve bundled application assets at a real, consistent HTTPS-like app origin; this is a more predictable origin for WebRTC APIs and app navigation rules.

## Changes
- Android now loads `https://appassets.androidplatform.net/assets/sura-chat.html` through WebViewAssetLoader's assets path handler.
- Existing Royal 3D HTML and RealtimeKit audio controls are unchanged and are still bundled offline inside the signed debug APK.
- Only exact `APP_URL` is permitted for main-frame navigations; SDK CDN and API HTTPS subresource requests can still load normally.
- File URL access, file-to-file and universal file origin access, DOM storage, mixed content and popups remain off.
- Existing microphone permission policy only grants audio capture (never camera) for appassets HTTPS origin with explicit Android runtime RECORD_AUDIO permission.
- If the Android WebView renderer crashes, show an error instead of a blank room screen. Reopening the app is required; automatic recovery not yet implemented.
- `androidx.webkit:webkit:1.18.0` (verified stable as of Nov 2026), versionCode 8, versionName 0.5.3-secure-webview-staging.

## QA and boundaries
- GitHub Android Debug CI must assemble and run repo Node/JS static contract tests.
- Two-device microphone/audio and Android background audio **not verified**. RTC tokens and a successfully loading asset origin do not prove audibility. Background microphone support requires separate platform-policy-safe lifecycle and foreground-service design.
- No changes to Cloudflare D1/user data/production; `PRESENCE_TTL_ENABLED` remains disabled.
- No payment, games, gifts, or Play Store release.

Sources:
- https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader
- https://developer.android.com/privacy-and-security/risks/webview-unsafe-file-inclusion
- https://developer.android.com/jetpack/androidx/releases/webkit

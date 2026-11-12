# SURA CHAT 0.5.4: Android WebView 74 startup crash fix

On 2026-11-12, the **real Android 10 emulator** (system WebView Chromium 74.0.3729.185) reproduced a blank Royal login, even though the app opened its secure appassets HTML and WebRTC API was available.

## Verified failure evidence
- GitHub Actions run 43245481854, Android instrumented test: `hasAuthForm=false`, `backHandler=false` while `secure=true`, `hasLogin=true`, `voiceRenderer=true`.
- Emulator logcat: `Uncaught SyntaxError: Unexpected token ?` at bundled `sura-chat.html:227`.
- Root cause: six optional-chain expressions (`?.`) and one nullish coalescing expression (`??`) used by the active inline app script, introduced in newer Chromium releases. An old Chromium WebView cannot parse any of that script, so the login handler never initializes.

## Fix
- Replaced all occurrences of ES2020 optional chaining and nullish coalescing in the app's inline JavaScript with equivalent ES2018 expressions, including the login/user fallback, RealtimeKit SDK check, RTC connection event guards and error messages.
- Android app and web HTML sources are byte-identical; a new contract test prevents reintroducing the syntax in the inline app script.
- Updated debug-only Android versionCode to 9, versionName to `0.5.4-webview-compat-staging`.
- Rerun Android emulator instrumented test. Device audio and two-handset tests are still pending; real production/Play Store deployment remains disabled.

## Acceptance results — PASS (2026-11-12)
- GitHub Android emulator runtime workflow [43246893009](https://github.com/soverixnet-design/sura-chat-/actions/runs/43246893009) **succeeded**: 1 instrumented test, 0 failures, 0 errors.
- Tested on Android 10 / API 29 with real system WebView Chromium 74.0.3729.185.
- Android logcat `SURA_ANDROID_SMOKE` reported: `secure:true`, `hasLogin:true`, `loginVisible:true`, `hasAuthForm:true`, `backHandler:true`, `voiceRenderer:true`, `microphoneApi:true`, and URL `https://appassets.androidplatform.net/assets/sura-chat.html`.
- Comparison: before the JS syntax change, exact same WebView had `Uncaught SyntaxError: Unexpected token ?` and `hasAuthForm:false`.
- Android debug build [43246892970](https://github.com/soverixnet-design/sura-chat-/actions/runs/43246892970) **succeeded**. All repo API/JavaScript contract tests on the fixed branch [43247167915](https://github.com/soverixnet-design/sura-chat-/actions/runs/43247167915) **succeeded**.
- Staging debug APK SHA-256: `54c0b31064f9b3d28faff02334dca3c7775a129e153414d217d44420d1da459b`.
- Boundaries: login **page rendering** is proven on a real emulator; an interactive user login/actual RTC voice call and two-device audibility are **not** yet demonstrated.

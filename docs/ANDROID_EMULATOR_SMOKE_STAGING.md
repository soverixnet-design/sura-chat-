# SURA CHAT — real Android emulator startup acceptance

This is an **automated Android emulator** test, not a JavaScript mock and not a two-person voice call.

- Android SDK 29 emulator with Google APIs launches the actual `RoyalWebActivity` from the existing debug application.
- AndroidJUnit4 and ActivityScenario inspect the WebView via `evaluateJavascript` and confirm the exact bundled secure HTTPS appassets URL, `window.isSecureContext`, displayed login form, functional JavaScript back callback, remote audio renderer DOM and availability of the WebRTC `getUserMedia` API.
- This is stronger evidence of a working installed WebView app than a successful Gradle compile. It does **not** verify that user credentials work on device, WebRTC networking, microphone runtime permission prompt, or audio transmission to a second device.
- The new workflow is separate from the existing quick Android build so developers can see failures and test logs without delaying every push. Synthetic only; no account creation, D1 changes, Worker redeploy or user data modification.
- Existing Android staging version 0.5.3 is deliberately unchanged; no new APK is necessary until code functionality is fixed.

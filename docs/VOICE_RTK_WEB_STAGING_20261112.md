# SURA CHAT Royal 3D real voice integration (STAGING; 12 November 2026)

## Implementation
- The **active** Royal WebView UI now connects to Cloudflare RealtimeKit Web Core SDK (`@cloudflare/realtimekit@2.0.4`) loaded only when the user taps **Join Voice**.
- Authenticated server issues tokens through `POST /api/v1/rooms/:id/voice/token` after membership/seat authorization. No provider keys or credentials are shipped to the Android APK.
- Presets verified on the SURA RealtimeKit staging application: `sura_voice_listener` has AUDIO NOT_ALLOWED, while `sura_voice_speaker` has AUDIO ALLOWED. Video and screen share are disallowed for both.
- Every join starts with microphone **muted**; seated users can explicitly tap **Unmute Mic**. A listener must select an unlocked seat first.
- Seat acquisition switches listening to a new speaker token. Standing, leaving, expiring or signing out closes the local audio session.
- Native Android WebView requests `RECORD_AUDIO` at runtime. WebChromeClient grants only `AUDIO_CAPTURE` from bundled, HTTPS `appassets.androidplatform.net` origin; no camera access. The app still fails closed for production releases.
- The room heartbeat remains gated server-side; stale cleanup is not enabled and requires acceptance tests with real devices.

## Required QA / remaining blockers
1. Verify WebView supports secure-context `getUserMedia` using the local base URL and that the pinned CDN SDK loads from the user's networks.
2. Test **two real Android devices**, with one seated speaker and one listener, then two speakers. Confirm audibility in both directions, echo, mute, background/foreground, interruption and headset routing.
3. RealtimeKit provider token endpoint must be exercised against authenticated accounts. Client use of the Web SDK in WebView is **not** native Android SDK integration; foreground/background audio stability is not guaranteed.
4. Confirm listener-to-speaker switching and revocation on stand/leave; test receiving explicit 401, 403, 503 failures.
5. Do not label the staging APK production ready. Coins, recharges, gifts, billing and game ledger remain unimplemented.

Cloudflare docs: https://developers.cloudflare.com/realtime/realtimekit/quickstart/ and https://developers.cloudflare.com/realtime/realtimekit/humans/core/local-participant/

# SURA CHAT v0.5.10 — Session + Room Exit Safety

This staging-only release combines two concurrent features without replacing an existing 0.5.9 GitHub release.

- Retained PR #13 logout reliability: capture request token to prevent late HTTP 401 from logging out a newly signed-in session, leave room before logout, and Android back/room overlay navigation safety.
- Added opt-in Keep me signed in checkbox: only a 7-day opaque bearer token and expiry stored in app-private WebView localStorage, never email or PIN/password. On cold launch validates token via GET /api/v1/me, displays Home only if valid; retries if offline without wiping session; expired sessions and logout erase local token.
- Android versionCode 15, versionName 0.5.10-session-room-safe-staging.
- Code tests cover remembered-login flows and room exit/late-401 protections. Old 0.5.9 release is preserved.
- Security: app-private localStorage is not separately Keystore encrypted; review migration to Android Keystore before production. No Cloudflare, D1, or Play Store release. No verified real two-device voice or background audio yet.

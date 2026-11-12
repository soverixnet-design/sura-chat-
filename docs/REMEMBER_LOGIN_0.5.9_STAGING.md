# SURA CHAT v0.5.9 — Remember signed-in SURA session (staging)
The user reported that login is unreliable. A concrete cold-start issue was found: WebView DOM storage was disabled and the Royal page always called `showLogin()` at launch, discarding the in-memory Bearer session on every app restart.

- Login and Signup now expose a visible **Keep me signed in on this phone (up to 7 days)** checkbox, checked by default but opt-out.
- On opt-in after successful authentication, store **only the opaque 7-day session token and expiration timestamp** in app-private origin localStorage. **Never persist password, email, payments or wallets.**
- On cold start, validate that saved token via real authenticated staging `GET /api/v1/me`; only render signed-in home after success. Invalid/expired token is erased on HTTP 401. On server timeout or temporary error, do not erase the valid token; show a persistent network message and Retry Saved Login action.
- Explicit Logout clears the local token whether or not the server logout call succeeds. HTTP 401 on other requests also clears it. Race guards ensure an old auto-login validation response cannot override a newer manual login.
- Android WebView DOM storage enabled on the exact trusted local appassets HTTPS origin; universal file URL access/mixed content/backup remain disabled. Native password store is not introduced.
- Note: WebView localStorage is app-private but **not cryptographically encrypted separately from the Android sandbox**. Do **not** use this staging architecture for a public production release without a security review and preferably Android Keystore-backed storage.
- Version 0.5.9, versionCode 14. No production, D1, Cloudflare, payments, billing or real accounts touched.
- Build, static contract tests and an Android emulator test should be verified before claiming sign-in is fixed. Real two-device audible voice is still pending.

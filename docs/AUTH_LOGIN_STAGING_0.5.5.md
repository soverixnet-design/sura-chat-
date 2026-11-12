# SURA CHAT v0.5.5 — first priority: recover login

- The SURA CHAT staging Worker is **distinct from Sharika** and uses its own D1 account credentials. It expects email + password. New SURA signup currently requires an 8-digit **numeric** password, while pre-existing SURA credentials retain their own hash and can be used for login.
- Old HTML displayed most failures as a 3.6-second toast only and did not explain `invalid_credentials`, `account_exists`, weak connectivity or a PIN rule. Failure could look like the login button silently failing.
- Added a persistent accessible error area in the login UI, clear backend code mapping, network timeout handling, native sign-in autofill, explicit 8-digit signup PIN and sign-in progress label. The account UI resets to Login after logout.
- Invalid auth responses are rejected instead of treating malformed payloads as valid sessions. Both web HTML source and Android asset remain identical.
- VersionCode 10, versionName 0.5.5-login-staging.
- A real live Android WebView signup/login/rooms acceptance test will be added and run against staging using a **synthetic test account** only. Temporary accounts must be cleaned from D1 after tests.
- No production deployment or unverified Google/phone auth. Password recovery requires verified ownership and is not available yet. No OTP-free impersonation fallback.

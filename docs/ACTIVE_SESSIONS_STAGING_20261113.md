# SURA CHAT — Account session visibility (staging branch, 13 Nov 2026)

## Implemented
- Authenticated GET /api/v1/auth/sessions returns active_sessions and other_sessions for the calling account.
- Read-only D1 query filters by the authenticated internal user ID, unexpired session and non-revoked status.
- No session hashes, raw tokens, IP addresses, device identifiers or other accounts' data leave the API.
- The owner's existing Royal Purple/Gold Profile → Account Security panel offers "Refresh active sessions".
- After password-confirmed "Sign out other phones", the panel updates to 1 active session.
- Web and Android embedded HTML remain byte-identical; no design replacement or fake balances.

## Verification
- Source tests in tests/active-sessions.test.mjs exercise anonymous access, account-scoped SQL, expired/revoked-session race and web/Android source equality.
- The GitHub API CI must pass for the latest commit; Android debug build must also pass before using the changed APK.
- Source changes are **not** a Cloudflare Worker deployment; frontend will require an API deploy in SURA staging to use the endpoint.
- No production release, account data change, wallet ledger change, SURA D1 migration or Sharika modification was made.

## Remaining release blockers
- Two physical phones' audible voice/RTC and background behavior are unverified.
- Google sign-in/account recovery, secure purchase/gift/write ledger and role-based admin tooling remain incomplete.
- Signed Play Store AAB, end-to-end mobile QA, policy/compliance and isolated production deployment are not verified.

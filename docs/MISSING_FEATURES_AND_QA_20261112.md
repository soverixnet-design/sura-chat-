# SURA CHAT — Missing features & acceptance checklist (12 Nov 2026)

Source of truth: owner-supplied `sura-chat.html`; maintain the gold/purple Royal reference UI, with original 3D assets, home/banner/room geometry, and mobile bottom navigation. Never restore the rejected assistant-designed screen or modify Sharika.

## Added on this staging branch in this review
- Live room-name search across the rooms currently fetched from the SURA API (maximum request of 40 rooms; not global server-wide search).
- Country-code filter (Global, My Country, any two-letter code) backed by the existing room list API; `home_country` preference places the signed-in member's country first.
- Room member profile overlay: fetch member profile by public ID and show avatar/name/ID/country/bio without leaving the room; private chat button only for server-supported 7-digit DM IDs.
- Same HTML in `web/index.html` and `android/app/src/main/assets/sura-chat.html`; regression tests added.

## Features with code present, but device/live QA still required
- Email/8-digit PIN login/sign-up; optional short-lived remembered session; profile name/bio and avatar uploads.
- Real room listing, creation, one-tap entry, seats, owner/admin controls, announcements, messages and leave cleanup; Moments and DM threads.
- RealtimeKit voice integration and microphone permission handling **exist in code** but have NOT been demonstrated audible between two physical phones. Background audio and reconnect testing remain release blockers.
- Read-only gift catalog (not a spend/send workflow).

## Missing / not yet active
| Priority | Area | Missing or incomplete behavior |
| --- | --- | --- |
| P0 | Authentication | Google sign-in, supported account recovery, security review of numeric-only sign-up PIN; two-phone regression tests |
| P0 | Voice and reliability | Real two-device audibility, mic/speaker controls, background playback, failed-network reconnect, server presence TTL migration/deployment verification |
| P0 | Safety & moderation | User block/report/appeals/abuse reporting and complete admin RBAC/audit |
| P1 | Rooms & profiles | Dedicated room cover/theme gallery, complete member popup actions, follow/invite, ability to edit manual country, unread notifications |
| P1 | Social & CP | CP request/consent, gift-box requirements, progress/badges, Friendship and follow relationships |
| P1 | Gifts & store | Secure gift send, priced video gifts with sound, single-player effects, frames/entry, VIP, Nobel/SBF, item expiries and special IDs |
| P1 | Wallet/economy | Secure virtual coin ledger, recharge with Play Billing where applicable, seller wallet, salary wallet, exchange/transfer rules and admin adjustments |
| P1 | BD/Agency/Host | Apply/create/join/roles, targets, earnings and ranking, server-side ledgers |
| P1 | Admin panel | User/room management, roles, authorized coin correction, gift/media catalog, banner and event publishing, audit history |
| P2 | Discovery | Server-side global room-name search/pagination, broader country selector, verified host ranking |
| P2 | Rankings & events | Daily/weekly/monthly, winners/rewards, notices, country banners, Daily Tasks, Lucky Box, results driven by audited server data |
| P2 | Games | Playable coin-only games with server-authoritative rules and preserved voice |
| P2 | Release | Production separation, privacy/Play compliance, signed AAB, full regression on small phones and Play closed testing |

## Rules
- Do not use demo accounts, fake room counts, fake balances, client-side admin passwords or simulated gift transfers in the active app.
- Worker snapshot and SQL schema snapshot must not be deployed as live migrations; production and Sharika resources are untouched.
- Do not claim working Google login, audio, purchases or published app without real acceptance evidence.
- Android Debug APK build/automated source tests are not equivalent to real phone, live voice or Play release verification.

## Immediate acceptance sequence
1. Ensure automated Node/API checks and `assembleDebug` are green on the latest branch commit, and compare rendered reference UI on 320/360/393/412px mobile viewports.
2. Use two real SURA accounts/devices to confirm login, room join, seat, room profile overlay, audio both directions, exit/rejoin, message privacy, avatar sync, and slow networks.
3. Before enabling wallets, gifts, admin or CP: implement corresponding server endpoints, permissions, migration plan and tests, then review Play policies and security.

This document describes feature presence in source and known omissions, not a production deployment.

## Additional changes verified in source — 13 Nov 2026
- Auth tab switches increment an auth generation counter: a delayed login request cannot unexpectedly sign in after switching between Login and Sign Up.
- Async page navigation is scoped by session and sequence; a late failed old request cannot replace a newly opened tab.
- When a room is hidden in the background, UI polling stops but best-effort room presence heartbeats continue. On foreground, heartbeat and room sync run immediately; no claim of OS-level background audio or guaranteed JS timers after process suspension.
- Moments authors, inbox peers, and active DM peers now open a real member profile (server-backed, with avatar/name/country/bio), and Messages offers direct user ID lookup.
- The staging Worker bindings include `VOICE_ENABLED=true`, D1, R2 and a RealtimeKit secret. It does **not** prove successful remote audio; two-device test remains required.
- Node contract tests are green for these changes. New Android debug source builds must be validated per commit before treating an APK as current.
- No SURA staging Worker, D1 schema, existing user rows, coins, or Sharika resources have been changed.

### Important next safety and feature gates
- Room presence schema migration `0079` must be checked against live database and deployed deliberately before enabling presence TTL; never execute a full schema snapshot over user data.
- Global block/report/appeal moderation remains unimplemented, a Play release blocker.
- Signup currently requires an 8-digit numeric secret; do not misrepresent this as robust account security. Consider longer password policy and verified account recovery before public release.
- RTC in a WebView without a native foreground audio service is not a verified solution for sustained background audio on Android.


## Implementation update — 13 November 2026 (staging only)
The owner-supplied Royal/Purple/Gold 3D mobile design is retained and synchronized byte-for-byte between Android and web.

### Completed in source and deployed on dedicated SURA staging Worker
- Block/unblock API: `GET/POST /api/v1/me/blocks`, storing private user relationships and filtering two-way private DMs, inbox, public Moments and text messages.
- Member reporting: `POST /api/v1/reports` validates context/reason, stores an operator-review record with ID, enforces per-user rate limits and a 15-minute repeated-target cooldown. Reporting UI is accessible from member profiles. **No staff review panel or appeal workflow yet**.
- Private conversations support seven- and eight-digit public IDs (legacy `SC` aliases handled server-side).
- Room-name search is now case-insensitive and server-side using a bound D1 query; the app fetches matches with an input debounce and country/sort/scope filters.
- User can edit manual 2-letter country code on their profile, stored in SURA D1. No GPS collected.
- The latest isolated SURA staging D1 database received additive migration `0080_sura_member_safety.sql`; two original user records and one room were unchanged during checks.
- Worker staging code published as version `83a0e376-2fd5-46b0-bca0-7fe6e1eef33d` with all eight existing bindings inherited, including the protected RealtimeKit secret; prior known deployable version `8890033f-fafd-41c3-9ecd-f1ff10babbd2`.
- Full API tests passed https://github.com/soverixnet-design/sura-chat-/actions/runs/43306438212.
- Live anonymous HTTP smoke passed https://github.com/soverixnet-design/sura-chat-/actions/runs/43307018645.
- Android Debug CI passed https://github.com/soverixnet-design/sura-chat-/actions/runs/43307027823.
- Do not deploy the SQL schema snapshot. Production and Sharika resources were untouched.

### Still missing: do not claim a complete published app
- Real two-physical-device audible RTC test, uninterrupted Android background audio, reconnect QA.
- Google login, password recovery / upgraded credentials, user privacy policy and Play review.
- Moderation staff dashboard, report review/appeal and enforcement lifecycle.
- Secure gifts/purchases/virtual ledgers, Play Billing, VIP/frames/entries, CP and Friendship.
- Rankings, events, daily tasks, coin-only games, BD/Agency/Host roles and comprehensive admin panel.
- Production signing, production API review, signed AAB and Play Store public rollout.

## Report moderation and member safety follow-up (13 Nov 2026)
- Added authenticated self-service `GET /api/v1/me/reports` with explicitly whitelisted private response fields, and account safety screens for My Reports and Blocked Members.
- Added `GET /api/v1/staff/access`, private `GET /api/v1/staff/reports` and `POST /api/v1/staff/reports/:uuid/review`; staff can mark open reports as reviewing/resolved/dismissed with a bounded review note and reviewer/timestamp record.
- **Closed by default**: reviewer permission requires `SURA_MODERATOR_IDS` to be configured on the SURA Worker with verified SURA account public IDs. This is **not configured** yet. Do not reuse or guess Sharika admin IDs; only an authenticated allowlisted SURA account can access the queue. No public admin UI or client-side staff toggle.
- Existing staging D1 migration `0080_sura_member_safety.sql` already holds review columns; no new schema changes, payment mutations, or user-data changes were necessary.
- Isolated SURA staging Worker version `ee4bd354-bb45-4d0a-9147-f942f5ea82ad`, deployment `87c08d45-d74d-4523-b05d-62b0f46d31fb`, deployed preserving all eight existing service bindings via strict inheritance.
- Latest source tests pass: https://github.com/soverixnet-design/sura-chat-/actions/runs/43310493271. Latest Android debug build passes: https://github.com/soverixnet-design/sura-chat-/actions/runs/43310492717. Live staging HTTP smoke, including anonymous 401 enforcement for staff/report endpoints, passes: https://github.com/soverixnet-design/sura-chat-/actions/runs/43310474273.
- Current feature branch includes the owner-supplied mobile design, not the rejected mock layout. Build is **staging debug**, not a signed Play Store release. There is no verified 2-device RTC audio test.

## Owner-requested continuation — room invite + real ranking (13 Nov 2026)
- Room controls now share an existing room UUID via system Web Share where supported, or copy that UUID to clipboard with a legacy fallback. Friends can paste it in Rooms → **Join a room by invitation code**. There is no public deep link, push notification or auto-join; server still checks room locks, membership and bans.
- **Create Room** immediately attempts entry into the newly created room after a successful server create response, removing the extra discovery tap.
- **Daily, Weekly, Monthly Room Activity Ranking** is available from dedicated `GET /api/v1/rankings/rooms?period=daily|weekly|monthly` backed by the existing D1 `room_audit_events` table; the UI labels `join_events` and `unique_visitors` honestly. This is **not** a gifts/coins/VIP/host/winner ranking. The API is read-only, excludes closed rooms, uses strict period allowlisting and optional country filtering. No artificial scores or prizes are created.
- Staff review form listener previously required an HTML `id` and ignored the class-based forms; fixed to accept `.report-review` submissions. Staff permissions are still verified server-side.
- API tests and static WebView JavaScript parse checks passed: https://github.com/soverixnet-design/sura-chat-/actions/runs/43311540016.
- Android debug build of the exact updated user HTML passed: https://github.com/soverixnet-design/sura-chat-/actions/runs/43311539926; artifact contains a signed **debug** APK, not an AAB.
- Read-only SQL on SURA staging D1 returned a real sample room with four join events and two distinct visitors in the 7-day window. This is one small staging data set, not a production engagement claim.
- Strict-inheritance Cloudflare staging Worker version `d7bb961f-f874-4810-8d39-ba562176640d` deployed using deployment `e7eb54cf-97f4-4621-9d75-efa17ad3576d`. Verified D1, R2, RTK token and all eight existing bindings survived. No D1 migration or user record edits.
- Live staging unauthenticated endpoint smoke, including room ranking result shapes/invalid periods, passed: https://github.com/soverixnet-design/sura-chat-/actions/runs/43312076374.
- Still absent: real 2-phone voice audibility and background voice guarantee, Google identity provider and recovery, Play Billing, verified coin ledger and gifting, admin coin grants, BD/host, CP, monetized rankings/weekly rewards, playable coin games, full Play release, and secured production backend. Owner reference UI remains in place.

## Account security implementation — 13 Nov 2026 (dedicated SURA staging)

- Added `POST /api/v1/auth/change-password`: requires an authenticated session and correct existing PIN/password, plus a new password of 10–64 characters with at least one letter and one digit. Old eight-digit signup PINs continue working for existing accounts; upgrades are voluntary.
- New random salt and PBKDF2 credentials are stored in the existing credential table with a conditional update matching the old password hash. Current session stays active; other device sessions are revoked. There is no login or profile endpoint leaking a password hash.
- Added `POST /api/v1/auth/revoke-other-sessions`: also verifies the current password and preserves the requesting session while revoking other tokens.
- The owner's original Royal profile has a collapsible **Account Security · Password & Devices** panel; `web/index.html` and the Android asset remain byte-identical.
- No new D1 migration, existing SURA account row, purchase/coin transfer or Sharika data change was required.
- API/source contract tests successful: https://github.com/soverixnet-design/sura-chat-/actions/runs/43317822303
- Android debug build successful: https://github.com/soverixnet-design/sura-chat-/actions/runs/43317822275
- Live staging anonymous endpoint protection smoke successful: https://github.com/soverixnet-design/sura-chat-/actions/runs/43318135414
- New staging Worker version `08956b93-1044-4a0d-9f08-fef28f8ce339`, deployed via `f43fa48e-3cdf-4402-a36c-707f582ffcdf` with all eight prior bindings retained. This is staging only, not production.
- CI APK artifact is an installable **debug** APK, not Play production AAB. Device-level success was not demonstrated from CI.
- Still outstanding: verified Google sign-in and secure recovery provider, strong-password *new signup* migration (the eight-digit signup PIN remains legacy), two physical phones with audible WebRTC voice, Android background audio service, Play privacy/release readiness, gift and wallet ledgers, and full administrative functions.
- Safety review before production should consider atomic password-update/session-revocation semantics, abuse throttling and credential migration. Never claim Google login or password recovery exists yet.

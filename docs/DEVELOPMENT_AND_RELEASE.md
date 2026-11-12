# SURA CHAT — engineering and release notes

## What was verified on 2026-11-12
- GitHub repository `soverixnet-design/sura-chat-` existed but was empty.
- Cloudflare staging Worker `sura-chat-api-staging` exists and has its own D1 `sura-chat-staging` and R2 `sura-chat-media-staging`.
- Existing Worker source was imported as a snapshot to `src/worker.js`; deployment was **not** changed.
- Existing D1 SQL schema was exported into a *reference snapshot*, without executing a migration.
- Staging Worker contains routes for auth, profile, Moments, rooms, seats, room chat, DM threads, gift catalog, optional voice token exchange, and moderation. All need real device and integration validation.
- The source explicitly disables financial writes, gifts purchase and admin money actions. This is intentional.

## Android code

A small native Java app exists under `android/`. It is a developer prototype, not a production-ready APK.

- Use Android Studio with Android Gradle Plugin 8.7.3, JDK 17 and Android SDK 35.
- Open the `android` folder as the Gradle project, sync dependencies and build the `debug` variant.
- The debug build connects to `https://sura-chat-api-staging.soverixnet.workers.dev`.
- The release build has an **empty** API URL and will fail closed until an audited production API is configured.
- Sessions are intentionally **in memory**, not persisted. After restart, sign in again.
- The staging signup API requires a numeric 8-digit password; a more secure login policy and verified recovery flow are release blockers.
- Staging pages support basic profile, room browsing/create/join/stand/leave, chat and read-only message list.
- No media playback, RTC voice connection, micropayment, privileged admin control, Store checkout, or production key material is included.

## Required acceptance tests

1. Successful signup/login and normal restart behavior on two physical Android devices.
2. Room card tap enters once; owner does not auto-sit; any user can only take a free unlocked seat.
3. Two device RTC call: microphone permission, mute/unmute, background audio, seat stand, reconnect and leave.
4. Room messages do not shift seats, and joining later does not reveal previous ordinary messages; announcement remains visible.
5. Avatar update propagates from profile to room and popup.
6. DM and profile privacy, block/report/abuse handling, rate limits, simultaneous seat contention.
7. Deny-by-default for financial and moderator APIs, ledger double-spend testing before enabling any financial action.
8. Android build, unit/instrumentation tests, Firebase/RTC integration, signed AAB, Play Console policy and testing requirements.
9. Voice and performance on slower networks; screen readers, Bengali/English labels, RTL/Arabic.
10. Separate production resources, approved domain and billing compliance. Never overwrite Sharika resources.

## Deployment safety

Do not run `database/schema.staging.snapshot.sql` against the existing database: it is a description of current state, not an incremental migration. Do not deploy `src/worker.js` directly without confirming exact current staging version, secrets, bindings and change diff. No live or production deployment has been made from this branch.

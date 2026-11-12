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

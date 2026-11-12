# SURA CHAT

A separate voice-room social app project. **Not the Sharika app**: never point this repository at Sharika databases, buckets, billing products or credentials.

## Current status — 12 November 2026

- The Cloudflare **staging** environment already exists: Worker `sura-chat-api-staging`, D1 `sura-chat-staging`, R2 `sura-chat-media-staging`.
- The staging Worker contains APIs for email/password authentication, account profiles and avatars, rooms and seats, direct messages, Moments, limited gifts catalog, and optional voice integration. Functional claims require end-to-end testing.
- The Android client, admin dashboard, completed RTC integration, payments and Play Store release are **not** present in this repository as a verified build.
- Money/coins, salary, gifts transactions and privileged admin mutations must remain disabled until independently implemented, audited and tested.

## Repository contents

Development work is staged on feature branches. `src/worker.js` is an imported **snapshot** of the existing staging Worker; do not deploy or replace the live Worker without validating existing bindings and behavior. `database/schema.staging.snapshot.sql` captures the current D1 schema for review; it is **not an executable migration for an existing database**.

## Design

Royal Premium Clean 3D: midnight navy `#101329`, royal purple `#31204B`, champagne gold `#E9BE68`, turquoise `#2FD6D1`. Five navigation tabs: Home · Rooms · Create/Live · Messages · Me. See `docs/SURA_CHAT_A_TO_Z_DESIGN_BLUEPRINT_BN.md` on the staging feature branch.

## Security and release rules

- Production and staging databases must remain separate.
- Only authenticated users may perform account or room mutations; enforced on the server.
- Room voice permission requires an explicit seat selection and microphone permission.
- Never commit API tokens, passwords, signing keys, Firebase configuration secrets or personal test accounts.
- No cashout or real-money wagering. Google Play Billing and social moderation compliance are release gates.
- No production deployment or store rollout is implied by this repository bootstrap.

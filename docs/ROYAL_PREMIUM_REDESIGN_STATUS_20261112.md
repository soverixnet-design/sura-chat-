# SURA CHAT Royal Premium 3D redesign — staging QA (2026-11-12)

Only **SURA CHAT** repository `soverixnet-design/sura-chat-`, branch `feature/sura-chat-staging-source-20261112` has been modified. Sharika and production are untouched.

## Implemented in Android 0.3.0-royal-staging
- Royal visual tokens, dark navy/purple gradients, cream/gold headings, gold actions, responsive cards, decorative 3D art and icon assets.
- Safer edge-to-edge system bar padding and a **fixed bottom navigation** (Home / Rooms / Moments / Messages / Profile) that does not scroll with content.
- Home: new banner and quick links to live Rooms, Moments, Messages, Event Center and Rankings; first three rooms and latest moments come from **real SURA staging API**, no invented user counts.
- Login and signup: redesigned forms; original email/password endpoint and signup requirements retained. Unsupported Google/social/phone login not advertised as functional.
- Rooms discovery: Popular / New / My / History from server, real audience counts, tapping enters using existing join endpoint; creation remains available.
- Voice room: royal-styled header, stage, announcement, seat badges, chat and footer. Existing room security and moderation actions preserved.
- Own profile: account name, public ID, country, bio editing, published avatar with initials fallback. Preview-only VIP, Special ID, Wallet, and decorations remain clearly labeled.
- User profile from in-room seat: published avatar, display name, public ID, country, bio and working private message action.
- Messages: server-backed searchable thread list, actual two-person chat history and send action.
- Moments: real server feed and new text post using the server's 500-character limit.
- Events and Rankings: **visual screen designs only** with explicit "Coming Soon" / no live data state. No fake winners, offers or credits.

## Known release blockers
- Voice/audio RTC is NOT connected to Android. Mic control queries a server status but cannot broadcast audio.
- Coin recharges / wallet / gift payments, VIP, rewards, rankings and event publishing do NOT have complete backend support.
- Google OAuth, phone/OTP and other social sign-ins are not integrated in this SURA build.
- Testing on physical Android devices (including small screen, seat join/leave, conversation and login), accessibility and performance review still required.
- Debug APK is for installation testing only, not a Play Store signed production release. No production API URL in the release build.

## Verification
GitHub Actions workflow: `.github/workflows/android-build.yml` assembles `app-debug.apk` using Java 17 + Android SDK 35. Use the artifact for the commit with the **0.3.0-royal-staging** version bump or later. Compilation passing does not imply live voice or payment functionality.

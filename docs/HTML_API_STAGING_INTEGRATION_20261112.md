# SURA CHAT: uploaded Royal HTML design -> real staging API

Updated 12 November 2026, branch `feature/sura-html-api-staging-20261112`.

## What changed
- The uploaded Royal Purple/Gold CSS was used as the visual starting point.
- All demo accounts, fabricated rooms, fake user counts, local balance editing, simulated winning outcomes and fake social-login actions were removed from the **new active HTML UI**.
- The new UI calls SURA staging API using bearer auth for login/signup, profiles, room list/create/join/leave/sit/stand, room chat, direct messages, Moments and read-only gifts.
- `web/index.html` is a static browser preview. Identical source is bundled in `android/app/src/main/assets/sura-chat.html`, launched by `RoyalWebActivity`.
- An existing native Android client remains in source for comparison/rollback, but does **not** launch from the icon in this staging build.
- The staging API requires 8-digit numeric signup passwords; no fake Google/Apple/Facebook login is offered.
- The app uses only in-memory session tokens; returning after a full process restart requires signing in again.
- Room seats and messages come from server responses and refresh periodically without fabricating user presence.

## Current limitations
- Microphone/RealtimeKit audio is not integrated. It is labeled unavailable, not represented as working.
- Coins, recharge, gifting transactions, games, rewards, rankings, events and live admin operations are disabled or explicitly marked not yet connected.
- No signed release, Play Store publication or production Worker deployment.
- Server health and two-device end-to-end testing remain necessary before public release.
- Existing SURA staging D1 and R2 are not modified by this code change.

## Recovery
- Backup branch: `backup/sura-chat-pre-html-20261112`.
- Existing native client and dedicated SURA Worker kept intact; no deletion of real user data.
- Staging feature source branch: `feature/sura-chat-staging-source-20261112`.

## QA next steps
1. Run Node tests and Android Assemble Debug CI on this branch.
2. Test login, create/join, seat contention, room messaging and logout on actual devices.
3. Implement RealtimeKit native audio and server stale-presence heartbeat after separate review.
4. Audit server permissions and ledger/billing policy before enabling coins or gifting.

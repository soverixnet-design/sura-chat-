# Voice playback reliability — SURA CHAT 0.5.1 (12 Nov 2026)

## Root issue confirmed
The 0.5.0 app initialized Cloudflare RealtimeKit Core and issued participant tokens, but omitted the remote media renderer. Cloudflare's custom UI documentation says that without the `rtk-participants-audio` element users will not hear other participants. This is not a server outage.

## Changed
- Added the `rtk-participants-audio` Web Component to the **active Royal 3D room**, with pinned `@cloudflare/realtimekit-ui@2.0.3` loader. The Core SDK remains pinned to `@cloudflare/realtimekit@2.0.4`.
- Loads Core and UI concurrently on the **Join Voice** button only; sets `audio.meeting` to the authenticated SDK meeting **before** joining; removes it on leave.
- Token issuance remains a protected backend call; no permanent API credentials ship in app assets.
- Voice generation counter cancels stale SDK/token joins if the user changes rooms, logs out or leaves before the network request completes.
- Android debug version bump to 0.5.1 (versionCode 6). No production deployment and no enablement of stale-presence TTL.
- Pinned CDN assets verified from GitHub-hosted runner: workflow run 43237334627 successfully fetched both files.

## Acceptance
- Server-side two-account staging QA previously passed membership, separate seats, chat, speaker/listener tokens and leave.
- **Still required:** true two-handset audible audio, WebView permission dialogs, routing/headset, networking drops and background/foreground media tests. The new player fixes a verified missing component but success is not evidence of audibility on phones.
- No recharge, gift purchases, games or release signing in this iteration.

References:
- https://developers.cloudflare.com/realtime/realtimekit/humans/ui-kit/build-your-own-ui/
- https://developers.cloudflare.com/realtime/realtimekit/humans/ui-kit/api-reference/core/rtk-participants-audio/

# SURA CHAT 0.5.2 voice connection diagnostics
Date: 2026-11-12. Branch: `feature/sura-voice-connection-diagnostics-20261112`.

This is a staging-only follow-up to the remote participant playback fix.

- The active Royal Voice Room now displays a concise **Receiving** connection state. Speaker users also see the mic media transport state; a "joined" token is no longer misrepresented as proof that remote audio is actually connected.
- `meeting.meta.on("mediaConnectionUpdate")` reports receiving and producing transport states, based on documented Cloudflare RealtimeKit events.
- `meeting.self.on("roomLeft")` reacts to unexpected disconnection, kick or meeting end. Losing voice does not silently leave a fake connected button; forced removal exits the room.
- UI reports mic permission errors and keeps a retry path. New room entry resets stale UI states. Server-side authorization and listener/speaker preset rules are unchanged.
- No Cloudflare Worker deployment, stale-presence flag activation, Production signing or Play release is part of this patch.

## QA evidence and limitations
- v0.5.1 offline headless Chromium mock walked login, room join, listener voice, seat acquisition, token renewal, speaker unmute and exit: **PASS**, no page errors. Because RTC SDK and API responses were mocked this does **not** prove real audio.
- The previous two-user *real staging backend* token API smoke also passed. Real two-device Android media playback and network connectivity are **not** verified.
- v0.5.2 should be checked with two handsets; see receiving/producing indicators. 'connected' means an SDK media transport connected, not that sound quality was tested.

Cloudflare documentation: https://developers.cloudflare.com/realtime/realtimekit/humans/core/meeting-metadata/ and https://developers.cloudflare.com/realtime/realtimekit/humans/core/local-participant/

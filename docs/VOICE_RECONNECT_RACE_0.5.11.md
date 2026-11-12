# SURA CHAT 0.5.11 — Voice reconnection race fix

Base: v0.5.10 staging (remember login, avatar sync and safe room exit retained).

## Verified source defect
Voice connection uses an asynchronous RealtimeKit `sdk.init` + `meeting.join` sequence. `stopVoice()` incremented a generation counter, but did not clear `S.voice.busy`. Entering another room while the previous SDK promise remained pending made the **Join Voice** button silently ignore taps. Clearing busy alone would introduce a second race: the old operation's `finally` could clear the new room's busy state while the new connection was still in progress.

## Fix
- Add `busyGeneration` ownership for each in-flight voice operation.
- `stopVoice` immediately releases its old pending state so the next room can connect.
- Both microphone toggle and join completion clear busy only if their generation still owns it.
- An executable Node VM test invokes the **exact voice functions extracted from Android's HTML source** with two overlapping SDK initialization promises. It asserts that stale room A gets closed and cannot alter room B's connection or busy state.
- No backend changes, no user data changes, no real money features. This does **not** prove two physical phones exchange audio. Run real-device audio QA before Play release.

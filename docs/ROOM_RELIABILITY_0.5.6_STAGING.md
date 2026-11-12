# SURA CHAT 0.5.6 — Royal room stability

Changes to **active Royal WebView** only; SURA CHAT (not Sharika). Android debug app is `versionCode 11` and `0.5.6-room-stability-staging`.

**Verified source issues corrected:**
- A room joined successfully but its first seat/message request could throw; because polling was started *after* that initial await, the room UI could remain open without ever retrying. Now the room is shown immediately after `/join`, timers begin first, and a bad initial request leaves a 4-second retry path.
- Four-second polling and manual message submission could overlap, duplicating messages or redrawing the entire seat grid. Sync requests are now single-flight, guarded by a room generation counter; message IDs are monotonic and ignored if already received.
- Seat layouts are keyed only by seat number, public user ID, display name and lock flag, rather than full backend payload and changing timestamps.
- Exiting the room hides the room **immediately**, stops voice and timers, then confirms server leave and makes at most one guarded retry if necessary. Old requests cannot overwrite a newly entered room. A server exit failure remains visible as an explicit error rather than claiming data consistency.

**Limitations and safety:** This code removes known race/failure paths; it is not proof of real two-phone media sound or background operation. Existing real user/room data remains untouched. No Worker/D1 migrations, production deployment, coins, money, games or Play Store publishing. `PRESENCE_TTL_ENABLED` remains off until all clients support heartbeat. The connected Android emulator login QA workflow from prior version was still in progress during development.

# SURA CHAT room heartbeat and stale seat recovery (staging-only)

## Why
A client crash or network failure may leave `room_memberships.left_at=NULL` and its seat assigned. The previous code only cleared them on an explicit leave. This change prepares a presence heartbeat and guarded cleanup.

## Files
- `src/worker.js`: authenticated `POST /api/v1/rooms/:uuid/heartbeat`, optional last-seen write, bounded stale cleanup and expiry-aware room count; voice participants are revoked before DB cleanup, and failures do not silently declare a user gone.
- `web/index.html` and matching Android asset: heartbeat every 25 seconds while the room is visible, immediate heartbeat on join/resume, safely ignore 404 while old Worker is deployed; no heartbeat while backgrounded.
- `RoomActivity.java`: original native room prototype also sends periodic heartbeats, despite not being the current launcher.
- `database/migrations/0079_sura_room_presence_heartbeat.sql`: additive SQL; does not delete app data.
- `tests/presence-heartbeat.test.mjs`: auth/migration/client contracts.

## Safe rollout sequence
1. Review and take a staging D1 recovery bookmark.
2. Deploy the audited Worker with `PRESENCE_TTL_ENABLED` unset or set to `false`. The heartbeat route responds with `tracking:false`, and the old schema remains compatible.
3. Run migration 0079 **once** against the *SURA staging* D1 database, not Sharika.
4. Distribute clients capable of sending the heartbeat and verify foreground/background lifecycle, poor network, simultaneous seats and logout.
5. Only then set `PRESENCE_TTL_ENABLED=true`; watch logs and room counts. The timeout is 180s and each request reaps up to 8 stale users.
6. Before production, add durable server-side cleanup scheduling and carefully test RealtimeKit revocation across crashes. No claim of production readiness.

## Status
Code staged in GitHub only; no migration executed, no Worker deployed and the flag is **not enabled**. Because of this, live seat cleanup is NOT yet active. No production or Sharika resources were touched.

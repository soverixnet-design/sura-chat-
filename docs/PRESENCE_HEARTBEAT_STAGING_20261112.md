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
1. **Completed 2026-11-12:** verified a SURA staging D1 recovery bookmark and zero active memberships/occupied seats; applied additive migration 0079 only to SURA staging D1; confirmed `last_seen_at_ms` and index exist.
2. **Pending:** review and deploy the audited Worker with `PRESENCE_TTL_ENABLED` unset or `false`. The new route then responds `tracking:false`; no cleanup runs.
3. **Pending:** distribute heartbeat-capable clients and validate background/foreground lifecycle, poor network, simultaneous seats and logout on real devices.
4. **Pending:** set `PRESENCE_TTL_ENABLED=true` only once clients have upgraded; monitor logs and active seats. TTL is 180s and each heartbeat can reap at most 8 stale users.
5. Before production, add durable server-side cleanup scheduling and test RealtimeKit revocation across crashes. No claim of production readiness.

## Status
Code is staged in GitHub and migration 0079 was successfully executed on the **SURA staging D1 only** (confirmed schema and index on 2026-11-12). The Worker has not been deployed and `PRESENCE_TTL_ENABLED` has not been activated. Therefore live seat cleanup remains **inactive**. No production or Sharika resources were touched.

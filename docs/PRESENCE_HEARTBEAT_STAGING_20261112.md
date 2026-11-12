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
2. **Completed:** audited worker source and deployed to SURA staging preserving all existing bindings; `PRESENCE_TTL_ENABLED` remains absent/false, so the route returns `tracking:false` and cleanup remains off.
3. **Pending:** distribute heartbeat-capable clients and validate background/foreground lifecycle, poor network, simultaneous seats and logout on real devices.
4. **Pending:** set `PRESENCE_TTL_ENABLED=true` only once clients have upgraded; monitor logs and active seats. TTL is 180s and each heartbeat can reap at most 8 stale users.
5. Before production, add durable server-side cleanup scheduling and test RealtimeKit revocation across crashes. No claim of production readiness.

## Status
Code is staged in GitHub and migration 0079 was successfully executed on **SURA staging D1 only**. On 2026-11-12 at 13:58 UTC, the staging Worker was **deployed** from this branch; its source hash was rechecked, the D1/R2/rate-limit/RealtimeKit bindings were all preserved, and compatibility date remained `2026-11-11`. The binding `PRESENCE_TTL_ENABLED` is still **absent** (disabled by default). Therefore live seat cleanup is **inactive** until successful client acceptance and deliberate enablement. No production or Sharika resources were touched. The initial external health request could not be performed from the model runtime; GitHub Actions smoke test was added to verify the published API from an external runner.

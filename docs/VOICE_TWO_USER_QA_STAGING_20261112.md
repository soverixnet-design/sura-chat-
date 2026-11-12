# SURA CHAT live staging two-account acceptance

Run only against dedicated SURA staging Cloudflare resources.

The temporary acceptance workflow creates two unique random-password accounts under `@example.invalid`, creates one temporary voice room, joins both identities, seats them, verifies chat and voice role/token issuing, stands them and leaves. The workflow prints the test addresses and room UUID for **targeted post-run D1 cleanup**. It never deletes real users. It does not validate actual audio between physical devices or background media reliability.

After the run, review result and manually delete only those test-created rows using the exact `suraqa-<runid>-a@example.invalid` and `suraqa-<runid>-b@example.invalid` identities. Never run global truncation. Release and autoplay mic must not be enabled until device testing is done.

## Verified run — 2026-11-12
- GitHub Actions: https://github.com/soverixnet-design/sura-chat-/actions/runs/43235321366 — **PASS**.
- Two temporary staging accounts were created and authenticated successfully.
- Both joined the same real SURA staging room, took independent seats and received each other's room chat.
- Both obtained Cloudflare RealtimeKit **speaker** participant tokens from the real backend; one obtained a **listener** token after standing.
- Both left; the reported occupied seat count was **0**.
- These are server/API/participant-token tests; they do **not** prove that two phones can hear each other.
- Post-run targeted cleanup completed: only the two test accounts, temporary QA room and their own records were deleted in SURA staging D1. Confirmed **zero QA accounts** remain; other user/room data remains intact.
- Automatic presence TTL remains disabled. A real non-QA member/room can exist; enabling TTL now would risk expiring an old client.

# Sura Chat Oracle integration — 16 November 2026

## Verified

- Oracle Cloud login and SSH to the existing Montreal Ubuntu instance work.
- Existing instance: VM.Standard.E2.1.Micro, 952 MB RAM, 2 visible CPUs, 42 GB free disk. This has not been load-tested for RTC.
- Existing Nginx serves the default page. No LiveKit, Docker, or Caddy service was present at inspection.
- Current Android code baseline: `feature/sura-seat-avatar-instant-sync-20261114`.
- All 126 Node tests passed; Worker syntax check passed.
- Live staging HTTP checks passed: health, config, rooms, room search, activity rankings, and anonymous denial for member-safety, password/session, report-review, profile, wallet, and heartbeat endpoints.
- The dedicated Sura Cloudflare staging Worker has database/media bindings and RealtimeKit configuration. Oracle is not its current media provider.
- Fixed the two-user acceptance workflow's obsolete eight-digit QA password generator to satisfy the current signup contract. The changed two-user workflow was syntax-checked, not executed against staging.

## Prepared

- Installed LiveKit v1.13.11 on Oracle at `/opt/sura-chat/livekit/1.13.11/livekit-server`; official release checksum and `--version` both passed. Service has not been started. No RTC credentials, DNS or firewall changes were made.

`infra/oracle/install-livekit-binary.sh` installs only checksum-verified official LiveKit v1.13.11. It deliberately does not start a service or change networking, credentials, DNS, or Nginx.

## Remaining before an Oracle-connected build

1. Select Sura RTC DNS hostname and configure trusted TLS.
2. Configure service credentials privately and securely connect the backend; secrets must never be bundled in Android or committed.
3. Review and allow the specific OCI/OS ingress required for TLS and WebRTC. Leave the raw management/API listener behind the TLS proxy. TURN configuration must be tested from mobile data.
4. Implement the client/server LiveKit provider transition, including listener-only permissions, host-authorized audio/video publishing, server-enforced demotion, token replay/reconnect protection, and room cleanup. Current code uses RealtimeKit; pointing it at a LiveKit URL alone does not work.
5. Build and run real two-device audio/video tests, guest approval/demotion tests and background/reconnect tests.
6. Verify other requested features separately. Google/phone login, video live and full privileged administration are not established by the passing API smoke tests.

## Publication status

User explicitly approved public publication and the Sura RTC hostname. Changes are published in PR #24 using the connected GitHub account. The DNS-only A record for sura-live.sharika.app was created and HTTP 200 verified. No new APK or completed Oracle-connected release is claimed.

## References

- https://docs.livekit.io/transport/self-hosting/deployment/
- https://docs.livekit.io/transport/self-hosting/ports-firewall/
- https://github.com/livekit/livekit/releases/tag/v1.13.11

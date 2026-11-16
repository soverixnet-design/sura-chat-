# Oracle staging activation checklist

Approved DNS: `sura-live.sharika.app`, DNS-only A record to the existing Oracle VM. Existing Sura Cloudflare API/database/media remain unchanged.

## Completed
- Official LiveKit v1.13.11 installed, checksum and version verified.
- DNS created; HTTP 200 confirmed from the hostname before installing the dedicated bootstrap virtual host.
- Source published in PR #24.

## HTTPS bootstrap

`sura-live-http.conf` serves only the ACME challenge and an explicit not-ready health response. It does not expose LiveKit. Install as its own Nginx virtual host; preserve existing default configuration. Test with `nginx -t` before reload.

Certificate issuance must use `sura-live.sharika.app` with a trusted CA. A new Let's Encrypt account requires acceptance of its Subscriber Agreement. Do not pass `--agree-tos` before the user confirms this step. Existing certificate/account reuse may be possible only after inspecting metadata without exposing private keys.

After agreement, a webroot issuance uses `/var/www/sura-acme`. Keep certificate keys private and configure automatic renewal before activation.

## Proposed ingress for review

| Direction | Protocol/port | Purpose |
|---|---|---|
| Inbound | TCP 80 | ACME validation |
| Inbound | TCP 443 | Trusted TLS / signaling proxy |
| Inbound | TCP 7881 | WebRTC TCP fallback |
| Inbound | UDP 7882 | WebRTC UDP mux |

Do not expose TCP 7880 directly. TURN for restrictive mobile networks still needs a separate tested design. Do not claim complete connectivity based on signaling alone. Inspect actual OCI and OS rules before requesting changes; do not overwrite unrelated rules or widen SSH.

## Required application work

The current application uses Cloudflare RealtimeKit. LiveKit is a different protocol; swapping its URL is insufficient. Backend token issuance, seat/host authorization, effective revoke/reconnect protection and the Android media client must be implemented and tested before switching the provider. Keep the current provider active until that passes. A short token expiry by itself is not sufficient revocation for self-hosted LiveKit.

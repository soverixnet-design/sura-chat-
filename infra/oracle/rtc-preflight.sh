#!/usr/bin/env bash
# Read-only SURA Oracle RTC preflight. Safe to run on the existing Ubuntu VM.
# Does not install, start, stop, reboot, modify firewall, request certificates
# or print credentials. Non-zero exit means at least one readiness gate failed.
set -uo pipefail
DOMAIN="sura-live.sharika.app"
EXPECTED_IP="68.233.122.123"
API="https://sura-chat-api-staging.soverixnet.workers.dev/health"
failed=0

ok()   { printf '[PASS] %s\n' "$1"; }
block(){ printf '[BLOCK] %s\n' "$1"; failed=$((failed+1)); }
note() { printf '[INFO] %s\n' "$1"; }

printf 'SURA CHAT Oracle RTC read-only readiness check\n'
note "Expected DNS: $DOMAIN -> $EXPECTED_IP"
note "Timestamp: $(date -u +'%Y-%m-%dT%H:%M:%SZ')"

if command -v getent >/dev/null 2>&1; then
  address="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1 {print $1}')"
  if [[ "$address" == "$EXPECTED_IP" ]]; then ok 'DNS points to Oracle instance'
  else block "DNS mismatch or unresolved (observed: ${address:-none})"; fi
else
  block 'getent is unavailable: cannot validate DNS'
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then ok 'Nginx service active'
  else block 'Nginx service not active'; fi
  if systemctl is-active --quiet sura-livekit; then ok 'LiveKit service active'
  else block 'LiveKit service not active'; fi
else
  block 'systemctl unavailable: cannot validate service state'
fi

if command -v ss >/dev/null 2>&1; then
  tcp_listeners="$(ss -H -ltn 2>/dev/null || true)"
  udp_listeners="$(ss -H -lun 2>/dev/null || true)"
  for port in 443 7881; do
    if grep -Eq ":$port[[:space:]]" <<< "$tcp_listeners"; then
      ok "TCP $port listening locally"
    else
      block "TCP $port not listening locally"
    fi
  done
  if grep -Eq ':7882[[:space:]]' <<< "$udp_listeners"; then
    ok 'UDP 7882 listening locally'
  else
    block 'UDP 7882 not listening locally'
  fi
else
  block 'ss unavailable: cannot validate listening ports'
fi

if command -v curl >/dev/null 2>&1; then
  if api_body="$(curl --fail --silent --show-error --connect-timeout 5 --max-time 12 "$API" 2>/dev/null)"; then
    if [[ "$api_body" == *'"status":"ok"'* && "$api_body" == *'"database":"connected"'* ]]; then
      ok 'Cloudflare SURA staging API and D1 healthy'
    else
      block 'Cloudflare SURA API responded without healthy D1 status'
    fi
  else
    block 'Cloudflare SURA staging API health probe failed'
  fi

  https_code="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --connect-timeout 5 --max-time 12 "https://$DOMAIN/health" 2>/dev/null || true)"
  if [[ "$https_code" == 200 ]]; then
    ok 'Oracle RTC HTTPS reverse proxy responds with trusted TLS'
  else
    block "Oracle HTTPS /health not reachable with trusted TLS (HTTP ${https_code:-none})"
  fi
else
  block 'curl unavailable: cannot validate API or HTTPS'
fi

if command -v free >/dev/null 2>&1; then
  note "Memory available (MiB): $(free -m | awk '/^Mem:/ {print $7}')"
fi
note 'A green HTTPS proxy alone does not prove successful WebRTC media or mobile TURN.'
note 'A two-device audio/video acceptance test remains mandatory before activation.'
if (( failed > 0 )); then
  printf '[RESULT] NOT READY: %d failed checks. No changes made.\n' "$failed"
  exit 1
fi
printf '[RESULT] LOCAL PREFLIGHT PASS; media acceptance tests still required.\n'

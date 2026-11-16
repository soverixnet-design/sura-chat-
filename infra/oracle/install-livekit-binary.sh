#!/usr/bin/env bash
# Install the pinned, checksum-verified server only. Does not start services,
# create credentials, alter firewalls, or replace an existing application.
set -euo pipefail
version=1.13.11
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || { echo 'Requires Linux x86_64' >&2; exit 1; }
command -v curl >/dev/null
command -v sha256sum >/dev/null
install_root=/opt/sura-chat/livekit
if [[ -e "$install_root/$version/livekit-server" ]]; then
  "$install_root/$version/livekit-server" --version
  exit 0
fi
work_dir=$(mktemp -d)
trap 'rm -rf -- "$work_dir"' EXIT
archive="livekit_${version}_linux_amd64.tar.gz"
release="https://github.com/livekit/livekit/releases/download/v${version}"
curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' --max-time 180 "$release/$archive" -o "$work_dir/$archive"
curl --fail --show-error --silent --location --proto '=https' --proto-redir '=https' --max-time 60 "$release/checksums.txt" -o "$work_dir/checksums.txt"
(cd "$work_dir"; awk -v file="$archive" '$2 == file || $2 == "*"file {print}' checksums.txt > selected.sha256; test "$(wc -l < selected.sha256)" -eq 1; sha256sum --check selected.sha256)
tar -xzf "$work_dir/$archive" -C "$work_dir" livekit-server
sudo install -d -m 755 "$install_root/$version"
sudo install -m 755 "$work_dir/livekit-server" "$install_root/$version/livekit-server"
"$install_root/$version/livekit-server" --version
printf '%s\n' 'Binary installed only; RTC service is not configured or running.'

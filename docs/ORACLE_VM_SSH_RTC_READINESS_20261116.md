# Sura Chat — Oracle VM access and RTC readiness (2026-11-16)

## Verified from console screenshots
- Oracle VM `instance-20261116-0933` reached **Running** and its create work request **Succeeded**.
- Region `ca-montreal-1`; Ubuntu 24.04; public IPv4 `68.233.122.123`; SSH login user `ubuntu`.
- VCN `sura-chat-vcn` CIDR `10.0.0.0/16`, regional public subnet `10.0.1.0/24`, default route `0.0.0.0/0` to internet gateway.
- Cloud Shell showed `cp: cannot create regular file '/home/soverixnet/.ssh/sura-chat.key': No such file or directory` and then `Permission denied (publickey)`. Thus SSH connectivity/authentication is **not** verified.
- An uploaded key file appeared in Cloud Shell as `ssh-key-2026-11-16.key(2).txt`; **do not assume it matches** the VM authorized key or publish its contents.
- Screenshots do not establish that Oracle is hosting any live RTC service.

## Safe recovery — in Oracle Cloud Shell
Do not paste private keys into chat, logs, GitHub, or tickets. Use the existing downloaded private key in the same authenticated Cloud Shell session. Run commands one at a time.

```bash
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
ls -lb "$HOME" | grep 'ssh-key-2026-11-16'
```

If the file name matches the screenshot exactly (including the `(2).txt` suffix), run:

```bash
cp -- "$HOME/ssh-key-2026-11-16.key(2).txt" "$HOME/.ssh/sura-chat.key"
chmod 600 "$HOME/.ssh/sura-chat.key"
ssh -o IdentitiesOnly=yes -i "$HOME/.ssh/sura-chat.key" ubuntu@68.233.122.123
```

If `ls` reports a different filename, substitute that exact name. If the key is not present, re-upload the **private** key generated for this VM into Cloud Shell, not the `.pub` file. The file extension does not prove it is a valid private key.

If SSH still reports `Permission denied (publickey)`, stop: compare the public key derived from the local private key (`ssh-keygen -y -f "$HOME/.ssh/sura-chat.key"`) with the authorized key originally configured on the instance. Never paste either private key or full diagnostic logs containing secrets into public issues. Use Oracle console serial connection/recovery only after confirming the VM boot image and access policy.

If SSH times out, verify OCI VCN subnet security list/NSG ingress TCP 22 from **the administrator's current public IP only**, VM OS firewall and public IP; do not expose port 22 to everyone as a permanent fix.

## After SSH is confirmed
```bash
whoami
cat /etc/os-release
uname -m
sudo systemctl status ssh --no-pager
```

Record sanitized results; then select a licensed, tested RTC stack and verify its CPU/RAM, bandwidth, UDP/TCP port requirements, TLS, TURN and mobile SDK support before installation. Do not open generic media port ranges without a specific selected implementation.

## Integration boundaries
- Keep `sura-chat-api-staging`, `sura-chat-staging` D1 and `sura-chat-media-staging` R2 unchanged.
- Keep Sharika credentials, domains, storage and billing completely separate.
- The Android prototype's voice button is not connected. Oracle VM **Running** is not evidence of working voice/video.
- Never store SSH keys or credentials in repository; never claim deployment without server checks and a two-device audio/video acceptance test.
- Prefer a staging RTC service and short-lived server-issued room tokens; verify authorization to speak only after seat selection and microphone permission.
- Confirm usage, network egress and boot-volume billing in Oracle Cost Analysis; Always Free eligibility does not guarantee every resource is free.

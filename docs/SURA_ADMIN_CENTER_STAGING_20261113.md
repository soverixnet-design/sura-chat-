# SURA CHAT — Admin Center, 13 November 2026

This feature extends the owner-provided Royal Purple/Gold mobile design without replacing it. It is **separate from Sharika**.

## Server-side functionality
- `GET /api/v1/staff/access` includes `admin_center: boolean`.
- A separate `SURA_ADMIN_IDS` allowlist of canonical seven/eight-digit **SURA user IDs** grants this view. When absent, access is denied. Room owner, SURA report moderator, SURA event editor and Sharika administrator roles do **not** implicitly grant admin privileges.
- Authenticated, rate-limited, allowlisted **read-only** endpoints:
  - `GET /api/v1/staff/admin/summary`: actual total users, active users, visible rooms and outstanding reports;
  - `GET /api/v1/staff/admin/users?public_id=...`: exact 7/8-digit member lookup (legacy SC aliases supported); display name, country, status, joined date, owned room count. No private email/credential/avatar token;
  - `GET /api/v1/staff/admin/rooms?limit=20&offset=0`: recent rooms, owner public ID, status, seats and joined member count;
  - `GET /api/v1/staff/admin/audit?limit=15`: staff audit actions and actor public IDs, **not internal target IDs**.
- Never return password hashes, session credentials, private wallet balances or payment data.

## Client
- **Profile → SURA Admin Center** appears only if the authenticated server response includes `admin_center: true`.
- Four real summary totals; exact public ID member search, recent rooms, admin action history.
- No fake user data or demo wallets. Existing report-review and live-event-editor screens remain separate.
- `web/index.html` and Android bundled `sura-chat.html` must be byte identical.

## Enablement / safety
This is not a standalone admin login, nor an unrestricted superadmin. To enable it for a real SURA account, the operator must verify account ownership and configure **that SURA account public ID** under `SURA_ADMIN_IDS` in the isolated SURA Worker. Do not guess IDs or reuse Sharika IDs.

No permissions to add/subtract coins, suspend/erase accounts, issue purchases, assign sellers or alter salaries are included. Those require separate atomic financial ledger and role/action audit implementation with security QA. No user/coin/wallet data migrations are needed for this read-only step.

## Release gates
CI tests, Android source build, dedicated SURA staging deployment and live anonymous access smoke must pass separately before any claim of live use. Real account admin testing and physical two-device voice are still required; no Play release is implied.

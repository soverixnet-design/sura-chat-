# SURA CHAT v0.5.8 — authentication / room-exit correctness

Three confirmed source-level defects addressed without modifying the Cloudflare Worker or user records:

1. `api()` previously cleared the **current** logged-in session on any 401 from an older in-flight request, including one sent with a previous token. It now captures the bearer token used by each fetch and only resets login if that same token is still active **and** the backend reports `session_expired` or `login_required`. A persistent login message explains the event.
2. Logging out while still in a room previously revoked the session **before** leaving the room on the server. This left an authenticated membership with no valid token to remove it. Logout now `await leave(null)` while the token is valid, then revokes the session.
3. Android Back in a room with its owner/admin Manage overlay previously exited the room instead of closing the overlay. Back now closes Manage first; Back from Login allows the Android activity to finish.

This is staging only. No D1 migration, no production deployment, no real user mutation. Requires Android QA and two-phone voice checks before Play publication.

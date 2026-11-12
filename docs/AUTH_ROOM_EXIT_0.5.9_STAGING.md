# SURA CHAT 0.5.9 — login, logout, room exit and Android Back

Based on the newer **0.5.8 avatar-sync** branch so profile-photo fixes are preserved.

- `api()` captures the bearer token per request; a late 401 from an older session cannot clear a newly logged-in account. Only a real `session_expired` / `login_required` response for the **current** token returns to login, with a persistent explanation.
- Logging out inside a room now sends authenticated `/leave` before revoking the bearer token, preventing a known source of ghost room membership.
- Android Back first closes the Royal owner/admin Manage overlay, then leaves the room on a second press. Back from Login exits the activity.
- Both WebView HTML and web/index.html are identical. Android debug versionCode 14, versionName `0.5.9-auth-room-exit-staging`.

No production release, backend migration or user data changes. Real two-device voice and full Android UI acceptance remain outstanding.

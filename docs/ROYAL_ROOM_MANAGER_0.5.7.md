# SURA CHAT Royal v0.5.7 — Room Manager controls

The existing SURA staging backend already implemented role-checked room management but the active Royal 3D Android WebView had **no room manager UI**. This patch exposes real functionality to owners and admins. No backend or database migration is needed.

- The app calls `GET /api/v1/rooms/{room_id}/manage` on join. The **Manage** button appears only if the backend authorizes that user as owner or room admin; ordinary members cannot access it.
- The separate overlay does not push seats or the chat message box. It includes real member IDs, empty seat locks/unlocks, kicking and banning other unprotected users, and unblocking.
- Room owners can edit the room name, announcement, lock/unlock room and choose 4/8/12/16 seats, plus assign/remove room admins. The backend itself validates owner-only settings, protected admins, locked seats and occupied-seat resize conflicts.
- Admins can use the server-authorized moderator subset. No visual button implies authorization without backend confirmation.
- Buttons show confirmation before kick/block/unblock and admin changes. All strings are HTML escaped and AJAX responses are ignored if room changed.
- This is a **staging debug APK**, not a Play Store release. Actual two-phone audible voice, background audio, social login and gifts/coins remain unverified or unfinished. Production, Sharika data, D1 users and Worker are unchanged.

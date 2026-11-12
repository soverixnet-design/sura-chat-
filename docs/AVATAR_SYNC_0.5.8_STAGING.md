# SURA CHAT 0.5.8 — Profile Avatar & in-room Seat Sync

This patch connects **existing server-side avatar capability** to the actual SURA CHAT Royal Android WebView UI. It is not Sharika.

- New profile upload chooser using the Android user-controlled `ACTION_GET_CONTENT` UI, restricted to a single `content://` URI with `image/*` type. No broad storage permission or background photo access.
- In-browser canvas scales/compresses the user-chosen image to a real WEBP blob of at most 256,000 bytes, matching staging worker `readImage` validation; uses authenticated `POST /api/v1/me/avatar` with `Content-Type: image/webp`.
- On a successful server response, the displayed profile photo updates and remains linked to the server's `avatar_key`; no untrusted URL is accepted directly. This is backed by Cloudflare R2.
- In room seats, the server's authenticated/user-controlled `public_id` and `avatar_key` select `GET /api/v1/users/{id}/avatar?v={key}`; using `avatar_key` in the grid signature triggers an image refresh after a profile update. No extra audio actions required. Empty and locked seats retain their existing icons.
- File chooser accepts images only from the explicit user gallery picker, not arbitrary Javascript-initiated file reads. **File access and universal file URL access remain disabled**, no camera permission, no cross-origin main-frame navigation.
- Android debug 0.5.8, versionCode 13. All development on staging only; production/Play Store, real two-phone voice, and Google login remain unfinished.
- Upload and native gallery availability must be tested on an Android handset, as static CI/build alone does not establish real device success.

# SURA CHAT — Royal Premium 3D icons (12 November 2026)

User-supplied artwork is now committed directly in the SURA CHAT Android project, separate from Sharika.

## 12 Android resources (verified in GitHub staging branch)

Each optimized transparent image is a WebP resource under `android/app/src/main/res/drawable-nodpi/`. Android resolves each name exactly as written below.

| Drawable | UI placement |
| --- | --- |
| `sura_announcement.webp` | room announcement, Create navigation, More |
| `sura_coin_rewards.webp` | reward/coin preview (transactions disabled) |
| `sura_diamond_wallet.webp` | diamond preview (disabled) |
| `sura_mic_on.webp` | reserved for real, connected RTC capture; **not currently active** |
| `sura_mic_off.webp` | room's mic-off status/action |
| `sura_special_id.webp` | profile Special ID preview |
| `sura_vip.webp` | VIP decoration preview |
| `sura_voice_support.webp` | room header, room cards, navigation |
| `sura_community.webp` | home/community |
| `sura_messages.webp` | messages tab, room chat |
| `sura_diamond_gift.webp` | gift catalog **inside a voice room**, preview-only |
| `sura_recharge.webp` | recharge design preview (payments disabled) |

Assets are user-uploaded, resized to 128px max for fast mobile UI; originals are preserved outside this repository. The supplied stock-watermarked `16639.jpg` was intentionally excluded.

## Integration and limitations

`MainActivity.java` and `RoomActivity.java` call `RoyalIcons.java` to load these drawables. The resource loader also has harmless text fallbacks for environments lacking artwork.

This is an Android **staging UI**. Passing an Android CI build verifies resource inclusion and compilation, not live voice, payments, gifts transactions, admin actions or Play Store release readiness.

Do not deploy Cloudflare Worker snapshots, change billing, or touch Sharika data as a consequence of these icon changes.

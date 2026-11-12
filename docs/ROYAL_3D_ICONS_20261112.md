# SURA CHAT — Royal Premium 3D icons (12 November 2026)

These are **user-provided** image references for the *SURA CHAT* Android client, not Sharika. The image assets are delivered separately in the downloadable bundle, because this branch's code-only commit cannot transfer the binary uploads.

## Android asset destination

Extract the bundled `android/app/src/main/res/drawable-nodpi/` folder into the same path of this repository.

| Drawable name | Placement |
| --- | --- |
| `sura_announcement` | room notice banner, Create shortcut, More |
| `sura_coin_rewards` | coins and rewards preview |
| `sura_diamond_wallet` | diamond wallet preview |
| `sura_mic_on` | **reserved**, use only after actual RTC capture is connected and live |
| `sura_mic_off` | voice-room mic-off action |
| `sura_special_id` | profile Special ID preview |
| `sura_vip` | VIP preview |
| `sura_voice_support` | room header, Room tab/cards |
| `sura_community` | Home / Community |
| `sura_messages` | Messages tab and chat |
| `sura_diamond_gift` | **inside the voice room only**: gift catalog preview |
| `sura_recharge` | recharge preview (disabled, no purchases) |

The supplied `16639.jpg` stock-watermarked megaphone was **not** packaged for publishing; use `sura_announcement` instead.

## Integration status

`RoyalIcons.java` handles presence/absence of optional drawables using safe fallback glyphs. `MainActivity.java` and `RoomActivity.java` have been wired to these resource names. **Until the PNGs in the companion bundle are copied into drawable-nodpi, the compiled GitHub branch will only show fallback text, not these new pictures.** Installing this asset folder is required to complete the visual update.

SURA CHAT staging only. Do not deploy Cloudflare Workers, touch Sharika data, enable coin purchases, or imply mic streaming without separately completing and testing those functions.

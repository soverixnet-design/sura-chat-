# SURA CHAT — Royal Premium 3D icon integration

Verified 12 November 2026. The user's 3D icons have been committed as twelve **PNG** resources to this SURA CHAT Android project (independent of Sharika). To prevent Android AAPT duplicate resource errors, redundant same-named WebP copies were removed. Original source references remain outside this repository.

| Resource basename | Android UI |
| --- | --- |
| sura_announcement | room announcement banner; Create / More shortcuts |
| sura_coin_rewards | coin / reward preview, no transactions |
| sura_diamond_wallet | diamond wallet preview, disabled |
| sura_mic_on | reserved for RTC-connected microphone; not active |
| sura_mic_off | room mic-off icon |
| sura_special_id | Special ID preview |
| sura_vip | VIP preview |
| sura_voice_support | rooms, room header, voice / support |
| sura_community | home/community |
| sura_messages | messages and room chat |
| sura_diamond_gift | gift catalog **inside the voice room**, preview only |
| sura_recharge | recharge preview (purchases disabled) |

Paths: `android/app/src/main/res/drawable-nodpi/sura_*.png`.
Code: `RoyalIcons.java`, `MainActivity.java`, and `RoomActivity.java`.

The user-supplied Shutterstock-watermarked megaphone image is not included; the original Royal announcement icon is used instead.

Passing Android debug CI validates compilation, not live RTC voice, payments, gift transfers, production config or Play Store release. No Cloudflare production deployment or Sharika modification is implied.

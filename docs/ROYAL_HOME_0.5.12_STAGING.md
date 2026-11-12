# SURA CHAT v0.5.12 — Royal home layout bug fix

Reproduced from the user's live screenshot: a **giant opaque orange block** covered most of the home hero. The home renderer used `<div class="big">` for a crown picture, but a global CSS rule `.big` styled that same element as a full-width orange button with padding. No API or server data was responsible for this.

## Changes
- Remove the incorrect `.big` crown wrapper and replace it with a dedicated, compact gold `.home-emblem`, preventing cross-component style collisions. Eliminate the long inline hero image that was rendered under the orange button style.
- Rebuild the active Royal home into a compact dark amethyst / warm gold hero, genuine room counts, 4 accessible real-feature shortcut buttons, featured room cards backed by the real SURA staging API, and meaningful create-room/share-moment links.
- Keep unimplemented Events/Rankings off the primary shortcut grid rather than misrepresenting them as functioning.
- Set `#main{flex:1 1 0%;min-height:0}` and `#nav{flex:0 0 auto}` to keep Android bottom navigation visible and stop the scrollable main content expanding the app offscreen.
- Narrow-device media queries; reduced-motion support.
- Same HTML in web/index.html and Android app assets; no Worker, Cloudflare D1, staging user, gift, voice, purchase or Play data modifications.
- Android v0.5.12 / versionCode 17; retains v0.5.11 Voice reconnection logic, v0.5.10 safe session and previous user profile/room fixes.

## QA
HTML JavaScript syntax and static regression checks. Android build must pass before test APK release. Real-device screenshot and two-phone audio QA remain to be done before production.

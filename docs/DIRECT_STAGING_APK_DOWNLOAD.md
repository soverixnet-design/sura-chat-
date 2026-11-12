# SURA CHAT APK — direct public download

Use the GitHub **pre-release** asset, not the ChatGPT sandbox attachment or expiring GitHub Actions artifacts.

- Staging-only debug APK verified in Android GitHub Actions run `43246892970` (app startup fixed for Android 10; instrumented emulator run `43246893009` passed).
- The upload workflow `.github/workflows/sura-staging-apk-download.yml` uses read-only access to the existing successful build artifact and write access only for creating GitHub release `sura-chat-v0.5.4-staging`.
- Upload is blocked if the SHA-256 of the downloaded APK differs from `54c0b31064f9b3d28faff02334dca3c7775a129e153414d217d44420d1da459b`.
- Public link once release succeeds: `https://github.com/soverixnet-design/sura-chat-/releases/download/sura-chat-v0.5.4-staging/SURA_CHAT_Royal_3D_v0.5.4_Login_Fix_Staging.apk`.
- App remains debug staging. This GitHub distribution is **not Google Play publication**. No Cloudflare/production changes.

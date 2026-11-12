# SURA v0.5.5: real Android sign-up / login acceptance

The additional Android 10 instrumentation test uses the **installed WebView app** and the real `sura-chat-api-staging.soverixnet.workers.dev` Worker, not a mocked login.

Steps: open Royal login → click Sign Up → enter unique `suraqa-auth-*.example.invalid` synthetic account and random 8-digit PIN → submit → verify Royal Home → fetch Profile → Logout → Login using same credentials → verify Home and Rooms. No users' credentials are read. Only this synthetic QA account is created; it must be deleted afterward using its exact logged email.

The prior v0.5.4 smoke verified static login page; this test verifies actual **authentication and page navigation**.

No true two-device WebRTC audible media validation yet. No account or billing data copied between Sharika and SURA.

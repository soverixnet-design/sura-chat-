# SURA CHAT live staging two-account acceptance

Run only against dedicated SURA staging Cloudflare resources.

The temporary acceptance workflow creates two unique random-password accounts under `@example.invalid`, creates one temporary voice room, joins both identities, seats them, verifies chat and voice role/token issuing, stands them and leaves. The workflow prints the test addresses and room UUID for **targeted post-run D1 cleanup**. It never deletes real users. It does not validate actual audio between physical devices or background media reliability.

After the run, review result and manually delete only those test-created rows using the exact `suraqa-<runid>-a@example.invalid` and `suraqa-<runid>-b@example.invalid` identities. Never run global truncation. Release and autoplay mic must not be enabled until device testing is done.

# Hosting migration, 2026-11-14

Production domains: https://eharmony.me and https://svitla.it.com. Both domains use the hosted Worker backend and private R2 storage. GitHub stores source and an encrypted full Windows backup; GitHub Pages is not used for backend execution.

Runtime source: online/. Build with node online/build-migration.mjs from that directory. Preserve .openai/hosting.json project identity when publishing through Sites. GitHub changes require a new backend publication; pushing this mirror alone does not deploy automatically.

Private data prefix: windows-migration-v2/. Runtime admin password and encrypted-backup recovery key are stored as secrets, not source. The original full backup and recovery instructions are in backups/2026-11-14/ and backups/README.md.

Behavior: direct in-WeChat access; external-browser option disabled and hidden; standalone save text with verified receipt; one-second no-cache display; Beijing-day manual/scheduled visibility; per-history-record visibility; original dated QR links remain valid.

The Windows cleanup script verifies new hosting, encrypted backup, unchanged original data, isolated site paths and other IIS projects before removing only the migrated application. Do not run it if new Windows data has not been migrated.

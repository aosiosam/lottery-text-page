# Migration completed: 2026-11-14

Both svitla.it.com and eharmony.me are hosted by the new backend. Current source and an encrypted full backup are stored in this repository. Admin password and backup recovery key remain private runtime secrets.

All 21 original Windows data files were checked against the verified backup before cleanup. The isolated Windows application directories, its IIS sites/application pools and scheduled tasks were removed. The pre/post snapshots of all other IIS websites matched; their source directories were not modified. An encrypted backup remains on the server, and an authenticated cleanup receipt is retained in the new backend.

Current UI: browser-opening option disabled and hidden; saved-text preview link removed; history editing includes a visibility checkbox.

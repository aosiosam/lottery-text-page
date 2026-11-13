# Encrypted Windows backup

Full project source, private data, IIS configuration and scheduled-task configuration are encrypted with AES-256-GCM. Raw passwords, SSH keys and the decryption key are not published here.

The key is retained in the hosted runtime secret WINDOWS_BACKUP_KEY and the owner’s offline recovery-key.json. Restore with Python cryptography installed:

```text
python backups/restore.py backups/2026-11-14 restored-backup.zip
```

Set WINDOWS_BACKUP_KEY in the environment first. Treat the restored ZIP as private.

import os,json,base64,hashlib,sys
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
p=Path(sys.argv[1]);m=json.loads((p/"manifest.json").read_text());c=(p/"full-backup.zip.aesgcm").read_bytes()
assert hashlib.sha256(c).hexdigest()==m["ciphertextSha256"]
raw=AESGCM(base64.b64decode(os.environ["WINDOWS_BACKUP_KEY"])).decrypt(base64.b64decode(m["nonce"]),c,m["aad"].encode())
assert hashlib.sha256(raw).hexdigest()==m["plaintextSha256"]
Path(sys.argv[2]).write_bytes(raw)
print("Backup decrypted and verified")

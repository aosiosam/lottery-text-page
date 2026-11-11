$ErrorActionPreference='Stop'
$root='C:\Sites\svitla-text'
$nodePath=(Get-Content -LiteralPath "$root\runtime.json" -Raw | ConvertFrom-Json).nodePath
Set-Location -LiteralPath "$root\app"
$env:HOST='127.0.0.1'
$env:PORT='3088'
& $nodePath "$root\app\server.mjs" >> "$root\logs\application.log" 2>&1
exit $LASTEXITCODE

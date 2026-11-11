$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$root='C:\Sites\svitla-text'
if(!(Test-Path -LiteralPath "$root\app\server.mjs")){throw 'Site directory not found'}
Get-ScheduledTask -TaskName 'SvitlaText-Isolated' -ErrorAction Stop|Out-Null
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$stage="$root\updates\auto-jump-$stamp"
$backup="$root\backups\auto-jump-$stamp"
New-Item -ItemType Directory -Path $stage,$backup -Force|Out-Null
$files=@{
 'admin.html'='f0d8606cbef3deeafbaa36d28fabd935e793727d7638b72912e86e84e1fdca52'
 'browser-open.mjs'='e0ce175c4dee46fcdb6d0d8b2e3aea13976fd1fe0affe073945d02f70a7df2c7'
}
foreach($name in $files.Keys){
 $url='https://raw.githubusercontent.com/aosiosam/lottery-text-page/6e149cff0e9650877563f0c0ab6fea9742753356/'+$name
 Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile "$stage\$name" -TimeoutSec 60
 if((Get-FileHash -LiteralPath "$stage\$name" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $files[$name]){throw "File check failed: $name"}
 Copy-Item -LiteralPath "$root\app\$name" -Destination "$backup\$name"
}
$nodePath=(Get-Content -LiteralPath "$root\runtime.json" -Raw|ConvertFrom-Json).nodePath
& $nodePath --check "$stage\browser-open.mjs"
if($LASTEXITCODE -ne 0){throw 'Source validation failed'}
Stop-ScheduledTask -TaskName 'SvitlaText-Isolated'
Start-Sleep -Seconds 2
if(Get-NetTCPConnection -LocalPort 3088 -State Listen -ErrorAction SilentlyContinue){Start-ScheduledTask -TaskName 'SvitlaText-Isolated';throw 'Service still running; update cancelled'}
try{
 foreach($name in $files.Keys){Copy-Item -LiteralPath "$stage\$name" -Destination "$root\app\$name" -Force}
 Start-ScheduledTask -TaskName 'SvitlaText-Isolated'
 $ready=$false
 for($i=0;$i -lt 12;$i++){
  try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3088/admin' -TimeoutSec 3;if($r.StatusCode -eq 200){$ready=$true;break}}catch{}
  Start-Sleep -Seconds 1
 }
 if(!$ready){throw 'Health check failed'}
 Write-Host 'Update completed. Refresh admin and enable the automatic redirect switch.' -ForegroundColor Green
}catch{
 $errorMessage=$_.Exception.Message
 Stop-ScheduledTask -TaskName 'SvitlaText-Isolated'
 Start-Sleep -Seconds 2
 foreach($name in $files.Keys){Copy-Item -LiteralPath "$backup\$name" -Destination "$root\app\$name" -Force}
 Start-ScheduledTask -TaskName 'SvitlaText-Isolated'
 throw "Update failed; previous source restored: $errorMessage"
}

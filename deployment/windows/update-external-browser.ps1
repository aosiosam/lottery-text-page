$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$root='C:\Sites\svitla-text'
if(!(Test-Path -LiteralPath "$root\app\server.mjs")){throw 'Site directory not found'}
Get-ScheduledTask -TaskName 'SvitlaText-Isolated' -ErrorAction Stop|Out-Null
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$stage="$root\updates\external-browser-$stamp"
$backup="$root\backups\external-browser-$stamp"
New-Item -ItemType Directory -Path $stage,$backup -Force|Out-Null
$files=@{
 'admin.html'='7de6efef260c4ad9e29dd40bd2477541aa1157f5cf569af5fb0e4e3f2b991f0a'
 'browser-open.mjs'='895b07348d28e0efeedd8eb51383991d1a29403e5e25a660ead46326dcce45a3'
}
foreach($name in $files.Keys){
 $url='https://raw.githubusercontent.com/aosiosam/lottery-text-page/4561ad6772fb193b440d6c98012708946c1a9c88/'+$name
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
 Write-Host 'Update completed. Refresh admin. External browser attempts require testing on your phone.' -ForegroundColor Green
}catch{
 $errorMessage=$_.Exception.Message
 Stop-ScheduledTask -TaskName 'SvitlaText-Isolated'
 Start-Sleep -Seconds 2
 foreach($name in $files.Keys){Copy-Item -LiteralPath "$backup\$name" -Destination "$root\app\$name" -Force}
 Start-ScheduledTask -TaskName 'SvitlaText-Isolated'
 throw "Update failed; previous source restored: $errorMessage"
}

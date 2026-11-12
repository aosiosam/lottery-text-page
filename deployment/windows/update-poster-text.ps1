$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$root='C:\Sites\svitla-text'
if(!(Test-Path -LiteralPath "$root\app\server.mjs")){throw 'Site directory not found'}
Get-ScheduledTask -TaskName 'SvitlaText-Isolated' -ErrorAction Stop|Out-Null
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$stage="$root\updates\poster-text-$stamp"
$backup="$root\backups\poster-text-$stamp"
New-Item -ItemType Directory -Path $stage,$backup -Force|Out-Null
$files=@{
 'server.mjs'='7f5ce5551f81c9276e3922698d80d1f14e592ddba102bf6b6c70bac151b7690a'
 'poster.html'='569b465368ca8a1e9e6fe9acb6d1a2e8a94dce648481bcf1822afc809477743c'
 'index.html'='736036144938d6d079418cf5f482b5b6e1f0ad165d60073eb58b4054bd85b5ce'
}
foreach($name in $files.Keys){
 $url='https://raw.githubusercontent.com/aosiosam/lottery-text-page/e3902fff36baf26e4b83f10728e1fd0148b890eb/'+$name
 Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile "$stage\$name" -TimeoutSec 60
 if((Get-FileHash -LiteralPath "$stage\$name" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $files[$name]){throw "File check failed: $name"}
 Copy-Item -LiteralPath "$root\app\$name" -Destination "$backup\$name"
}
$nodePath=(Get-Content -LiteralPath "$root\runtime.json" -Raw|ConvertFrom-Json).nodePath
& $nodePath --check "$stage\server.mjs"
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
 Write-Host 'Poster text editing enabled. Saving text does not regenerate images or enable display.' -ForegroundColor Green
}catch{
 $errorMessage=$_.Exception.Message
 Stop-ScheduledTask -TaskName 'SvitlaText-Isolated'
 Start-Sleep -Seconds 2
 foreach($name in $files.Keys){Copy-Item -LiteralPath "$backup\$name" -Destination "$root\app\$name" -Force}
 Start-ScheduledTask -TaskName 'SvitlaText-Isolated'
 throw "Update failed; previous source restored: $errorMessage"
}

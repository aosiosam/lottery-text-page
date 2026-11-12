$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$root='C:\Sites\svitla-text'
if(!(Test-Path -LiteralPath "$root\app\server.mjs")){throw 'Site directory not found'}
Get-ScheduledTask -TaskName 'SvitlaText-Isolated' -ErrorAction Stop|Out-Null
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$stage="$root\updates\android-download-$stamp"
$backup="$root\backups\android-download-$stamp"
New-Item -ItemType Directory -Path $stage,$backup -Force|Out-Null
$files=@{
 'browser-open.mjs'='4baf5e8690eb834ff9870aa7fce726966fd701efb0ec46788691008d65e3aa28'
}
foreach($name in $files.Keys){
 $url='https://raw.githubusercontent.com/aosiosam/lottery-text-page/017006c1f5ab4fd4f7b0aa737f3081470ec81384/'+$name
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
 $probe=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3088/open-browser?target=https%3A%2F%2Fsvitla.it.com%2F2026-11-12' -UserAgent 'Mozilla/5.0 Android MicroMessenger/8.0.50' -TimeoutSec 10
 if($probe.Headers['Content-Disposition'] -notmatch 'browser-test.xlsx'){throw 'Android attachment check failed'}
 Write-Host 'Android download prompt enabled. iPhone branch unchanged.' -ForegroundColor Green
}catch{
 $errorMessage=$_.Exception.Message
 Stop-ScheduledTask -TaskName 'SvitlaText-Isolated'
 Start-Sleep -Seconds 2
 foreach($name in $files.Keys){Copy-Item -LiteralPath "$backup\$name" -Destination "$root\app\$name" -Force}
 Start-ScheduledTask -TaskName 'SvitlaText-Isolated'
 throw "Update failed; previous source restored: $errorMessage"
}

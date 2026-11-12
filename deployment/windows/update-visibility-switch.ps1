$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$root='C:\Sites\svitla-text'
if(!(Test-Path -LiteralPath "$root\app\server.mjs")){throw 'Site directory not found'}
Get-ScheduledTask -TaskName 'SvitlaText-Isolated' -ErrorAction Stop|Out-Null
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$stage="$root\updates\visibility-switch-$stamp"
$backup="$root\backups\visibility-switch-$stamp"
New-Item -ItemType Directory -Path $stage,$backup -Force|Out-Null
$files=@{
 'server.mjs'='8d2ed775aa009521617166cad32071c34f15e728daa01099b29cbb71609d97c8'
}
foreach($name in $files.Keys){
 $url='https://raw.githubusercontent.com/aosiosam/lottery-text-page/afd065c96a369b0d2a17537581e9435e52520d7c/'+$name
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
 Write-Host 'Today visibility switch fixed. Existing display setting and history were preserved.' -ForegroundColor Green
}catch{
 $errorMessage=$_.Exception.Message
 Stop-ScheduledTask -TaskName 'SvitlaText-Isolated'
 Start-Sleep -Seconds 2
 foreach($name in $files.Keys){Copy-Item -LiteralPath "$backup\$name" -Destination "$root\app\$name" -Force}
 Start-ScheduledTask -TaskName 'SvitlaText-Isolated'
 throw "Update failed; previous source restored: $errorMessage"
}

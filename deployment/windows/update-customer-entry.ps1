$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
Import-Module WebAdministration
$site='EharmonyWechatTest-Isolated'
$pool='EharmonyCustomer-Isolated'
$root='C:\Sites\svitla-text'
$web='C:\Sites\eharmony-wechat-live'
$task='SvitlaText-Isolated'
$current=Get-Website -Name $site -ErrorAction Stop
if($current.PhysicalPath -notin @('C:\Sites\eharmony-wechat-test\www',$web)){throw 'Unexpected domain directory; stopped.'}
if(!(Get-WebBinding -Name $site -Protocol https)){throw 'Test domain HTTPS is not ready.'}
Get-ScheduledTask -TaskName $task -ErrorAction Stop|Out-Null
function Snapshot-Others {
 $rows=@(Get-Website|Where-Object {$_.Name -ne $site -and $_.Name -ne 'SvitlaText-Isolated'}|Sort-Object Name|ForEach-Object {[pscustomobject]@{name=$_.Name;state=[string]$_.State;path=$_.PhysicalPath;bindings=@($_.Bindings.Collection|ForEach-Object {$_.protocol+' '+$_.bindingInformation+' '+$_.sslFlags}|Sort-Object)}})
 ConvertTo-Json -InputObject $rows -Depth 8 -Compress
}
$before=Snapshot-Others
$oldPath=$current.PhysicalPath
$oldPool=$current.ApplicationPool
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$stage="$root\updates\customer-entry-$stamp"
$backup="$root\backups\customer-entry-$stamp"
New-Item -ItemType Directory -Path $stage,$backup -Force|Out-Null
[IO.File]::WriteAllText("$backup\sites-before.json",$before)
[IO.File]::WriteAllText("$backup\domain-before.json",(@{path=$oldPath;pool=$oldPool}|ConvertTo-Json))
$files=@{
 'server.mjs'='2b3dcdfc00b117f8c80b31814e93097a2e661b38d25db70022d5dfee8d06ebae'
 'entry-routing.mjs'='90b3cca9459b750d233ad1d8c86dfe25b18dac50db4cb8aba73221fd45737f2d'
 'browser-open.mjs'='5dfac63a188fc92580e08446a57cd8835a652b70153c96d268e7159202575369'
 'poster-service.mjs'='0f03d3f348f3a057a4902580f933dad79284715fb4a845152f19addd30b7433a'
}
foreach($name in $files.Keys){
 Invoke-WebRequest -UseBasicParsing ('https://raw.githubusercontent.com/aosiosam/lottery-text-page/3f63edfc6319572728a3a95402874993c006e362/'+$name) -OutFile "$stage\$name" -TimeoutSec 60
 if((Get-FileHash -LiteralPath "$stage\$name" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $files[$name]){throw "File check failed: $name"}
 if(Test-Path -LiteralPath "$root\app\$name"){Copy-Item -LiteralPath "$root\app\$name" -Destination "$backup\$name"}
}
$node=(Get-Content -LiteralPath "$root\runtime.json" -Raw|ConvertFrom-Json).nodePath
foreach($name in $files.Keys){& $node --check "$stage\$name";if($LASTEXITCODE -ne 0){throw "Source check failed: $name"}}
New-Item -ItemType Directory -Path "$web\App_Code" -Force|Out-Null
Copy-Item -LiteralPath "$root\iis\web.config" -Destination "$web\web.config" -Force
$proxy=[IO.File]::ReadAllText("$root\iis\App_Code\SvitlaProxy.cs").Replace('https://svitla.it.com','https://eharmony.me')
[IO.File]::WriteAllText("$web\App_Code\SvitlaProxy.cs",$proxy,(New-Object Text.UTF8Encoding($true)))
$verify='3ec8d8db9982067211e0d5f094bec457.txt'
if(Test-Path -LiteralPath "$root\iis\$verify"){Copy-Item -LiteralPath "$root\iis\$verify" -Destination "$web\$verify" -Force}
if(!(Test-Path "IIS:\AppPools\$pool")){New-WebAppPool $pool|Out-Null}
Set-ItemProperty "IIS:\AppPools\$pool" -Name managedRuntimeVersion -Value 'v4.0'
& icacls.exe $web /grant ("IIS AppPool\"+$pool+':(OI)(CI)(RX)') /T /C|Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not grant read permission.'}
Stop-ScheduledTask -TaskName $task
Start-Sleep -Seconds 2
if(Get-NetTCPConnection -LocalPort 3088 -State Listen -ErrorAction SilentlyContinue){Start-ScheduledTask -TaskName $task;throw 'Application still running; update stopped.'}
try {
 foreach($name in $files.Keys){Copy-Item -LiteralPath "$stage\$name" -Destination "$root\app\$name" -Force}
 Start-ScheduledTask -TaskName $task
 $ready=$false
 for($i=0;$i -lt 15;$i++){
  try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3088/api/entry-health' -TimeoutSec 3;if($r.Content.Trim() -eq 'SVITLA-TEXT-READY-v1'){$ready=$true;break}}catch{}
  Start-Sleep -Seconds 1
 }
 if(!$ready){throw 'Application health check failed.'}
 Set-ItemProperty "IIS:\Sites\$site" -Name physicalPath -Value $web
 Set-ItemProperty "IIS:\Sites\$site" -Name applicationPool -Value $pool
 if((Get-WebAppPoolState $pool).Value -ne 'Started'){Start-WebAppPool $pool}
 $check=Invoke-WebRequest -UseBasicParsing 'https://eharmony.me/api/entry-health' -TimeoutSec 20
 if($check.Content.Trim() -ne 'SVITLA-TEXT-READY-v1'){throw 'Customer domain proxy check failed.'}
 $page=Invoke-WebRequest -UseBasicParsing 'https://eharmony.me/' -TimeoutSec 20
 if($page.StatusCode -ne 200 -or $page.Content.Contains('EH-20261112')){throw 'Customer page check failed.'}
 if((Snapshot-Others) -ne $before){throw 'Other website snapshot changed.'}
 Write-Host 'READY: https://eharmony.me/' -ForegroundColor Green
 Write-Host 'Admin: https://eharmony.me/admin' -ForegroundColor Green
 Write-Host 'Automatic entry: https://eharmony.me/go' -ForegroundColor Green
 Write-Host 'Generate a NEW QR image in admin for the new domain.' -ForegroundColor Yellow
}catch{
 $message=$_.Exception.Message
 Set-ItemProperty "IIS:\Sites\$site" -Name physicalPath -Value $oldPath
 Set-ItemProperty "IIS:\Sites\$site" -Name applicationPool -Value $oldPool
 Stop-ScheduledTask -TaskName $task
 Start-Sleep -Seconds 2
 foreach($name in $files.Keys){if(Test-Path -LiteralPath "$backup\$name"){Copy-Item -LiteralPath "$backup\$name" -Destination "$root\app\$name" -Force}else{Remove-Item -LiteralPath "$root\app\$name" -ErrorAction SilentlyContinue}}
 Start-ScheduledTask -TaskName $task
 throw "Update failed; previous application and domain restored: $message"
}

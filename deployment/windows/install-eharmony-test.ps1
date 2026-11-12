$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
Import-Module WebAdministration
$site='EharmonyWechatTest-Isolated'
$domain='eharmony.me'
$root='C:\Sites\eharmony-wechat-test'
$www="$root\www"
$stamp=Get-Date -Format yyyyMMdd-HHmmss
$stage="$root\staging\$stamp"
$backup="$root\backups\$stamp"
function Snapshot-OtherSites {
 $rows=@(Get-Website|Where-Object Name -ne $site|Sort-Object Name|ForEach-Object {
  [pscustomobject]@{name=$_.Name;state=[string]$_.State;path=$_.PhysicalPath;bindings=@($_.Bindings.Collection|ForEach-Object {$_.protocol+' '+$_.bindingInformation+' '+$_.sslFlags}|Sort-Object)}
 })
 return ConvertTo-Json -InputObject $rows -Depth 8 -Compress
}
$before=Snapshot-OtherSites
foreach($other in @(Get-Website|Where-Object Name -ne $site)){
 foreach($binding in $other.Bindings.Collection){if($binding.bindingInformation -match ':eharmony\.me$'){throw 'eharmony.me is already bound to another project; no changes made.'}}
}
$existing=Get-Website -Name $site -ErrorAction SilentlyContinue
if($existing -and $existing.PhysicalPath -ne $www){throw 'Test site name is already used by another directory.'}
New-Item -ItemType Directory -Path $root,$www,$stage,$backup -Force|Out-Null
[IO.File]::WriteAllText("$backup\other-sites-before.json",$before,(New-Object Text.UTF8Encoding($false)))
$files=@{
 'index.html'='4c8c5771f7a0f40391bb0089bcc5a36c42a87c848b7c925c26502d97162850da'
'browser-test.html'='1a96098bcc69e0534b7b2f8f650480e36b9a96b1a608d57be6c2203144b50fa1'
'web.config'='231585fb74b3245e4de94002dd8dba30ddb406ffcea693df3d053b09b3dec0eb'
'_test-status.txt'='c59485fa6335f6a692374d72f243f514482bac819bc6024a04cfd8cf115f36f5'
}
foreach($name in $files.Keys){
 $url='https://raw.githubusercontent.com/aosiosam/lottery-text-page/452f94a1a571f342f5f5f553cc4d66a821c16e87/deployment/domain-tests/eharmony-me/'+$name
 Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile "$stage\$name" -TimeoutSec 60
 if((Get-FileHash -LiteralPath "$stage\$name" -Algorithm SHA256).Hash.ToLowerInvariant() -ne $files[$name]){throw "File check failed: $name"}
 if(Test-Path -LiteralPath "$www\$name"){Copy-Item -LiteralPath "$www\$name" -Destination "$backup\$name"}
}
foreach($name in $files.Keys){Copy-Item -LiteralPath "$stage\$name" -Destination "$www\$name" -Force}
if(!(Test-Path -LiteralPath "IIS:\AppPools\$site")){New-WebAppPool -Name $site|Out-Null;Set-ItemProperty -LiteralPath "IIS:\AppPools\$site" -Name managedRuntimeVersion -Value ''}
if(!$existing){New-Website -Name $site -Port 80 -HostHeader $domain -PhysicalPath $www -ApplicationPool $site|Out-Null}
& icacls.exe $www /grant ("IIS AppPool\"+$site+':(OI)(CI)(RX)') /T /C|Out-Null
if($LASTEXITCODE -ne 0){throw 'Could not set read permission for the isolated test site'}
if((Get-WebAppPoolState -Name $site).Value -ne 'Started'){Start-WebAppPool -Name $site}
if((Get-Website -Name $site).State -ne 'Started'){Start-Website -Name $site}
$probe=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1/_test-status.txt' -Headers @{Host=$domain} -TimeoutSec 15
if($probe.Content.Trim() -ne 'EHARMONY-WX-TEST-20261112'){throw 'Local host binding check failed'}
Write-Host 'Independent HTTP test site is ready.' -ForegroundColor Green
if(!(Get-WebBinding -Name $site -Protocol https -ErrorAction SilentlyContinue)){
 $acme="$root\acme"
 New-Item -ItemType Directory -Path $acme,"$acme\config","$acme\logs" -Force|Out-Null
 $source='C:\Sites\svitla-text\acme'
 if(!(Test-Path -LiteralPath "$source\wacs.exe")){$source='C:\49-acme'}
 if(!(Test-Path -LiteralPath "$source\wacs.exe")){throw 'Existing ACME tool was not found; existing projects are unchanged'}
 Copy-Item -LiteralPath "$source\wacs.exe" -Destination "$acme\wacs.exe" -Force
 Copy-Item -LiteralPath "$source\settings_default.json" -Destination "$acme\settings_default.json" -Force
 $settings=Get-Content -LiteralPath "$acme\settings_default.json" -Raw|ConvertFrom-Json
 $settings.Client.ConfigurationPath="$acme\config"
 $settings.Client.LogPath="$acme\logs"
 [IO.File]::WriteAllText("$acme\settings.json",($settings|ConvertTo-Json -Depth 40),(New-Object Text.UTF8Encoding($false)))
 $id=(Get-Website -Name $site).Id
 Push-Location -LiteralPath $acme
 try{
  & "$acme\wacs.exe" --source manual --host $domain --friendlyname eharmony-wechat-test --validation filesystem --webroot $www --store certificatestore --certificatestore WebHosting --installation iis --installationsiteid $id --notaskscheduler --baseuri https://acme-v02.api.letsencrypt.org/ --accepttos
  $certificateExit=$LASTEXITCODE
 }finally{Pop-Location}
 if($certificateExit -ne 0){throw 'HTTPS certificate setup failed; only the isolated HTTP test site was created'}
}
$after=Snapshot-OtherSites
[IO.File]::WriteAllText("$backup\other-sites-after.json",$after,(New-Object Text.UTF8Encoding($false)))
if($before -cne $after){throw 'Existing site baseline changed during setup. Review before/after JSON; no existing project was edited by this script.'}
Write-Host 'TEST SITE READY: https://eharmony.me/' -ForegroundColor Green
Write-Host 'BROWSER TEST: https://eharmony.me/browser-test.html' -ForegroundColor Green
Write-Host 'Existing websites and bindings match the baseline. Production site is not migrated.' -ForegroundColor Green

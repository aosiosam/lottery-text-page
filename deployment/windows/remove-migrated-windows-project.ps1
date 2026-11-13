param([switch]$HostingVerifiedExternally)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
Import-Module WebAdministration
$root='C:\Sites\svitla-text'
$originalBackup='C:\MigrationBackups\lottery-20261114-023537'
$sitePaths=@{'SvitlaText-Isolated'='C:\Sites\svitla-text\iis';'EharmonyWechatTest-Isolated'='C:\Sites\eharmony-wechat-live'}
$pools=@('SvitlaText-Isolated','EharmonyWechatTest-Isolated','EharmonyAndroidDownloadTest-Isolated','EharmonyCustomer-Isolated')
$targets=@('C:\Sites\svitla-text','C:\Sites\eharmony-wechat-test','C:\Sites\eharmony-wechat-live',$originalBackup)
# Literal allowlist and resolved absolute paths are checked before any removal.
foreach($path in $targets){
 $full=[IO.Path]::GetFullPath($path).TrimEnd('\')
 if($full -ne $path.TrimEnd('\')){throw 'Unexpected resolved cleanup path.'}
 if($path -eq $originalBackup){if(!$full.StartsWith('C:\MigrationBackups\lottery-', [StringComparison]::OrdinalIgnoreCase)){throw 'Backup path escaped scope.'}}
 elseif(!$full.StartsWith('C:\Sites\',[StringComparison]::OrdinalIgnoreCase)){throw 'Project path escaped scope.'}
 if(Test-Path -LiteralPath $path){$links=@(Get-Item -LiteralPath $path;Get-ChildItem -LiteralPath $path -Recurse -Force)|Where-Object {($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0};if($links){throw 'Reparse point found; cleanup stopped.'}}
}
foreach($name in $sitePaths.Keys){$s=Get-Website -Name $name -ErrorAction SilentlyContinue;if($s -and $s.PhysicalPath -ne $sitePaths[$name]){throw "Unexpected website path: $name"}}
function Other-Sites {
 $rows=@(Get-Website|Where-Object {!$sitePaths.ContainsKey($_.Name)}|Sort-Object Name|ForEach-Object {[pscustomobject]@{name=$_.Name;state=[string]$_.State;path=$_.PhysicalPath;pool=$_.ApplicationPool;bindings=@($_.Bindings.Collection|ForEach-Object {$_.protocol+' '+$_.bindingInformation+' '+$_.sslFlags}|Sort-Object)}})
 ConvertTo-Json -InputObject $rows -Depth 8 -Compress
}
$before=Other-Sites
if(!$HostingVerifiedExternally){foreach($domain in @('eharmony.me','svitla.it.com')){
 $r=Invoke-WebRequest -UseBasicParsing ("https://$domain/api/entry-health") -TimeoutSec 30
 if($r.Content.Trim() -ne 'SVITLA-TEXT-READY-v1' -or $r.Headers['Server'] -notmatch 'cloudflare'){throw "New hosting is not serving $domain; nothing deleted."}
}}
$encrypted='C:\MigrationBackups\lottery-migrated-20261114.aesgcm'
New-Item -ItemType Directory -Path 'C:\MigrationBackups' -Force|Out-Null
if(!(Test-Path -LiteralPath $encrypted)){Invoke-WebRequest -UseBasicParsing 'https://raw.githubusercontent.com/aosiosam/lottery-text-page/5f4332cfc8147c4269f7716c903bfb6c2612b2a1/backups/2026-11-14/full-backup.zip.aesgcm' -OutFile $encrypted -TimeoutSec 120}
if((Get-FileHash -LiteralPath $encrypted -Algorithm SHA256).Hash.ToLowerInvariant() -ne 'b10c594d08d2822633be331354f65534593fb2d7a22c99a0315d74ebf2652ba7'){throw 'GitHub encrypted backup check failed; nothing deleted.'}
if(!(Test-Path -LiteralPath "$originalBackup\data-manifest.json")){throw 'Original migration manifest missing; cleanup stopped.'}
$expected=Get-Content -LiteralPath "$originalBackup\data-manifest.json" -Raw|ConvertFrom-Json
$newBase='https://eharmony.me'
if(!$HostingVerifiedExternally){
$login=@{username='admin';password=[IO.File]::ReadAllText("$root\app\data\admin-password.txt").Trim()}|ConvertTo-Json -Compress
Invoke-WebRequest -UseBasicParsing "$newBase/api/login" -Method Post -ContentType 'application/json' -Body $login -SessionVariable receiptSession -TimeoutSec 30|Out-Null
$newSettings=Invoke-RestMethod "$newBase/api/admin/settings" -WebSession $receiptSession -TimeoutSec 20
$csrf=$newSettings.csrf
$login=$null
}
Stop-ScheduledTask -TaskName 'SvitlaText-Isolated' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
try{
 if(Get-NetTCPConnection -LocalPort 3088 -State Listen -ErrorAction SilentlyContinue){throw 'Old application is still running; cleanup stopped.'}
 $current=@(Get-ChildItem -LiteralPath "$root\app\data" -Recurse -File)
 if($current.Count -ne $expected.Count){throw 'Data changed since backup; cleanup stopped to preserve new data.'}
 foreach($f in $expected){$path=Join-Path "$root\app\data" ($f.key.Replace('/','\'));if(!(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.sha256){throw "Data changed since backup: $($f.key). Nothing deleted."}}
}catch{Start-ScheduledTask -TaskName 'SvitlaText-Isolated' -ErrorAction SilentlyContinue;throw}
foreach($task in @('SvitlaText-Isolated','SvitlaSSL-Isolated')){if(Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue){Stop-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue;Unregister-ScheduledTask -TaskName $task -Confirm:$false}}
foreach($name in $sitePaths.Keys){if(Get-Website -Name $name -ErrorAction SilentlyContinue){Stop-Website -Name $name;Remove-Website -Name $name}}
foreach($pool in $pools){
 if(Test-Path -LiteralPath "IIS:\AppPools\$pool"){
  $used=@(Get-Website|Where-Object ApplicationPool -eq $pool)
  $apps=@(Get-WebApplication|Where-Object ApplicationPool -eq $pool)
  if(!$used.Count -and !$apps.Count){if((Get-WebAppPoolState -Name $pool).Value -eq 'Started'){Stop-WebAppPool -Name $pool};Remove-WebAppPool -Name $pool}
 }
}
foreach($path in $targets){if(Test-Path -LiteralPath $path){Remove-Item -LiteralPath $path -Recurse -Force}}
$after=Other-Sites
if($after -ne $before){throw 'Other website configuration changed; inspect cleanup log.'}
$receipt='C:\MigrationBackups\lottery-cleanup-result.json'
$report=@{completed=$true;completedAt=[DateTime]::UtcNow.ToString('o');server=$env:COMPUTERNAME;removed=$targets;otherSitesUnchanged=$true;encryptedBackup=$encrypted;dataFilesChecked=$expected.Count}
[IO.File]::WriteAllText($receipt,($report|ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
$hash=(Get-FileHash -LiteralPath $receipt -Algorithm SHA256).Hash.ToLowerInvariant()
if(!$HostingVerifiedExternally){
Invoke-RestMethod ($newBase+'/api/admin/migration/object?key=migration%2Fcleanup.json&sha256='+$hash) -Method Post -WebSession $receiptSession -Headers @{'X-CSRF-Token'=$csrf} -ContentType 'application/octet-stream' -InFile $receipt -TimeoutSec 30|Out-Null
Invoke-WebRequest -UseBasicParsing "$newBase/api/logout" -Method Post -WebSession $receiptSession -Headers @{'X-CSRF-Token'=$csrf} -TimeoutSec 20|Out-Null
}
$report|ConvertTo-Json -Depth 8 -Compress
Write-Host 'COMPLETE: old lottery application and plaintext data removed; other projects unchanged.' -ForegroundColor Green
Write-Host 'GitHub encrypted backup verified. Both domains are served by the new hosting.' -ForegroundColor Green

param(
  [string]$VpsIp    = "kurate.drsrv.net.ar",
  [string]$User     = "root",
  [string]$KeyPath  = "$HOME\.ssh\id_rsa",
  [string]$LocalDir = "D:\KuraTe-platform"
)

$taskName = "KuraTe-PullBackups"
$scriptPath = Join-Path $PSScriptRoot "pull-backups.ps1"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -VpsIp $VpsIp -User $User -KeyPath `"$KeyPath`" -LocalDir `"$LocalDir`""
$trigger = New-ScheduledTaskTrigger -Daily -At 03:30am
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -RunLevel Highest

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Force

Write-Host "Installed Windows task: $taskName (daily at 03:30)" -ForegroundColor Green
Write-Host "Pulls backups from $User@$VpsIp to $LocalDir" -ForegroundColor Cyan

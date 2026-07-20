# Registers a Windows Scheduled Task on YOUR ADMIN PC (external to 91.208.206.35).
# Do NOT run this on the virtual server — monitoring from inside cannot detect a full outage.
# Run once as Administrator from the repo on Windows:
#   powershell -ExecutionPolicy Bypass -File scripts\install-server-watch-task.ps1

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$NodeExe = (Get-Command node -ErrorAction Stop).Source
$ScriptPath = Join-Path $RepoRoot 'scripts\server-watch.js'
$TaskName = 'KuraTe-ServerWatch'

if (-not (Test-Path $ScriptPath)) {
    Write-Error "Missing $ScriptPath"
}

$Action = New-ScheduledTaskAction -Execute $NodeExe -Argument "`"$ScriptPath`"" -WorkingDirectory $RepoRoot
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
    -RepetitionInterval (New-TimeSpan -Minutes 3) `
    -RepetitionDuration ([TimeSpan]::MaxValue)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 2) -MultipleInstances IgnoreNew

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings `
    -Description 'External TCP watch for 91.208.206.35 — runs on this Windows PC only, not on the server' -Force | Out-Null

Write-Host "Installed scheduled task: $TaskName (external monitor on this PC)"
Write-Host "  Runs every 3 minutes from OUTSIDE the virtual server"
Write-Host "  Script: $ScriptPath"
Write-Host "  Alerts: WhatsApp +5491178280156 via CallMeBot (WATCH_CALLMEBOT_API_KEY in .env)"
Write-Host "  REQUIRED for scheduled task — QR-based WhatsApp Web does not work in background."
Write-Host ""
if (-not $env:WATCH_CALLMEBOT_API_KEY) {
    $envFile = Join-Path $RepoRoot '.env'
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*WATCH_CALLMEBOT_API_KEY=(.+)$') {
                $script:CallMeBotKey = $matches[1].Trim()
            }
        }
    }
}
if (-not $CallMeBotKey -or $CallMeBotKey -eq '') {
    Write-Host "  WARNING: WATCH_CALLMEBOT_API_KEY not set — alerts will fail until configured."
    Write-Host "  Run: test_watch_whatsapp.bat  after setup (see CallMeBot link in that script)."
} else {
    Write-Host "  CallMeBot key found in .env — WhatsApp alerts should work."
}
Write-Host ""
Write-Host "Test reachability:  check_server.bat"
Write-Host "Test WhatsApp:      test_watch_whatsapp.bat"
Write-Host "Remove task:        Unregister-ScheduledTask -TaskName $TaskName -Confirm:`$false"

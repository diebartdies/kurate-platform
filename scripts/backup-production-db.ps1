# KuraTe — Backup diario de produccion (tarea KuraTe-DB-Backup)
#
# Antes este script hacia su propio mongodump por SSH y lo copiaba a mano. Ahora
# el VPS ya genera y valida el dump con su cron (03:00 UTC, daily_backup.sh ->
# /root/KuraTe-platform/backups/mongo_*.gz). Duplicar el dump era lento y podia
# dejar dos copias distintas. Este script:
#   1) verifica que haya un backup reciente (< 26 h) en el VPS y, si no, lo corre
#   2) delega la descarga/archivo en scripts\pull-backups.ps1 (DB-BACK\YYYY-MM-DD)

$ErrorActionPreference = 'Stop'

$VpsIp    = '192.168.1.95'
$User     = 'root'
$KeyPath  = "$HOME\.ssh\id_kurate_rsa"
$RemoteDir = '/root/KuraTe-platform/backups'
$LocalDir = 'D:\FullMinent\DB-BACK'
$MaxAgeHours = 26

$SshOpts = @(
  '-i', $KeyPath,
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=20',
  '-o', 'StrictHostKeyChecking=accept-new'
)
$Target = "$User@$VpsIp"

function Log($msg, $color = 'Gray') {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line -ForegroundColor $color
}

if (-not (Test-Path $LocalDir)) { New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null }

Log '=== KuraTe backup: verificando el dump del VPS ==='

# La antiguedad se calcula EN el VPS: si el reloj de esta PC esta corrido, la
# comparacion contra la hora local daria negativa (paso: -3.6 h de desfase).
$probe = 'f=$(ls -1t /root/KuraTe-platform/backups/mongo_*.gz 2>/dev/null | head -1); if [ -n "$f" ]; then echo $(( $(date +%s) - $(stat -c %Y "$f") )); else echo MISSING; fi'
$ageSec = "$(& ssh @SshOpts $Target $probe 2>$null | Select-Object -Last 1)".Trim()

$ageHours = $null
if ($ageSec -match '^-?\d+$') {
  $ageHours = [math]::Round([int64]$ageSec / 3600.0, 1)
  Log "ultimo backup en el VPS: hace $ageHours h"
}

if ($null -eq $ageHours -or $ageHours -gt $MaxAgeHours) {
  Log 'backup ausente o viejo: corriendo daily_backup.sh en el VPS...' 'Yellow'
  & ssh @SshOpts $Target "bash /root/KuraTe-platform/daily_backup.sh" 2>&1 | ForEach-Object { Log "  $_" }
  if ($LASTEXITCODE -ne 0) {
    Log 'ERROR: daily_backup.sh fallo en el VPS' 'Red'
    exit 1
  }
}

Log 'descargando a DB-BACK...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'pull-backups.ps1') `
  -VpsIp $VpsIp -User $User -KeyPath $KeyPath -LocalDir $LocalDir
$rc = $LASTEXITCODE

if ($rc -ne 0) { Log 'ERROR: fallo la descarga del backup' 'Red'; exit 1 }
Log '=== backup OK ===' 'Green'
exit 0

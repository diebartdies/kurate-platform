# KuraTe — Backup diario (tarea KuraTe-DailyBackup)
#
# Version vieja: corria `docker exec KuraTe_mongo mongodump` en ESTA PC. Desde que
# la produccion vive en el VPS 192.168.1.95 ya no hay stack local, asi que fallaba
# siempre. Ahora delega en scripts\backup-production-db.ps1, que verifica el dump
# del VPS (cron 03:00 UTC) y lo archiva en D:\FullMinent\DB-BACK\YYYY-MM-DD\.

$ErrorActionPreference = 'Stop'

$target = Join-Path (Split-Path $PSScriptRoot -Parent) 'scripts\backup-production-db.ps1'
if (-not (Test-Path $target)) {
  Write-Host "ERROR: no existe $target" -ForegroundColor Red
  exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $target
exit $LASTEXITCODE

# KuraTe — Trae el ultimo backup de MongoDB del VPS (wrapper historico)
#
# Toda la logica vive en scripts\pull-backups.ps1 (baja los mongo_*.gz del VPS y
# los archiva en D:\FullMinent\DB-BACK\YYYY-MM-DD\kurate-backup-YYYY-MM-DD.gz).
# Este archivo se mantiene porque la tarea programada KuraTe-PullBackup apunta aca.
#
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pull-backup.ps1

param(
  [string]$VpsIp    = "192.168.1.95",
  [string]$User     = "root",
  [string]$KeyPath  = "$HOME\.ssh\id_kurate_rsa",
  [string]$LocalDir = "D:\FullMinent\DB-BACK"
)

$ErrorActionPreference = "Stop"

$main = Join-Path $PSScriptRoot "pull-backups.ps1"
if (-not (Test-Path $main)) {
  Write-Host "ERROR: no existe $main" -ForegroundColor Red
  exit 1
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $main `
  -VpsIp $VpsIp -User $User -KeyPath $KeyPath -LocalDir $LocalDir
exit $LASTEXITCODE

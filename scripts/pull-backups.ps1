# KuraTe — Trae los backups de MongoDB del VPS al archivo local (DB-BACK)
#
# El VPS genera el dump con su cron diario (03:00 UTC):
#   /root/KuraTe-platform/backups/mongo_YYYYMMDD_HHMMSS.gz   (mongodump --archive --gzip, ya validado)
# Este script los baja y los archiva con el nombre historico:
#   D:\FullMinent\DB-BACK\YYYY-MM-DD\kurate-backup-YYYY-MM-DD.gz
# Verifica que el archivo sea un gzip real (magic 1F 8B) y un tamano minimo,
# para no dar por bueno un backup truncado. Retiene N dias (30 por defecto).
#
# Uso:  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\pull-backups.ps1
# Task: KuraTe-PullBackups / KuraTe-DB-Backup / KuraTe-PullBackup / KuraTe-DailyBackup

param(
  [string]$VpsIp         = "192.168.1.95",
  [string]$User          = "root",
  [string]$KeyPath       = "$HOME\.ssh\id_kurate_rsa",
  [int]$SshPort          = 22,
  [string]$LocalDir      = "D:\FullMinent\DB-BACK",
  [int]$RetentionDays    = 30,
  [int]$MinBytes         = 10240,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

$RemoteBackupDir = "/root/KuraTe-platform/backups"
$LogFile         = Join-Path $LocalDir "pull-backups.log"
$Target          = "$User@$VpsIp"

# ssh y scp no comparten las banderas de puerto (-p vs -P)
$SshOpts = @(
  "-i", $KeyPath,
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=20",
  "-o", "StrictHostKeyChecking=accept-new",
  "-p", "$SshPort"
)
$ScpOpts = @(
  "-i", $KeyPath,
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=20",
  "-o", "StrictHostKeyChecking=accept-new",
  "-P", "$SshPort"
)

if (-not (Test-Path $LocalDir)) { New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null }

function Log($msg, $color = "Gray") {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line -ForegroundColor $color
  Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

function Test-Gzip($path) {
  try {
    $fs = [System.IO.File]::OpenRead($path)
    try {
      $b = New-Object byte[] 2
      $null = $fs.Read($b, 0, 2)
      return ($b[0] -eq 0x1F -and $b[1] -eq 0x8B)
    } finally { $fs.Dispose() }
  } catch { return $false }
}

Log "=== pull de backups desde $Target ===" "Cyan"

# 1) Listado remoto (mas nuevo primero). ls falla con exit!=0 si no hay archivos.
$remoteFiles = & ssh @SshOpts $Target "ls -1t $RemoteBackupDir/mongo_*.gz 2>/dev/null" 2>$null
$remoteFiles = @($remoteFiles | Where-Object { $_ -and $_.Trim() -ne "" } | ForEach-Object { $_.Trim() })

if ($remoteFiles.Count -eq 0) {
  Log "ERROR: no hay backups en ${Target}:$RemoteBackupDir (revisar el cron del VPS)" "Red"
  exit 1
}

Log ("remotos disponibles: " + $remoteFiles.Count)

$downloaded = 0
$skipped    = 0
$failed     = 0
$seenDays   = @{}

foreach ($remote in $remoteFiles) {
  $name = Split-Path $remote -Leaf

  if ($name -notmatch '^mongo_(\d{4})(\d{2})(\d{2})_(\d{6})\.gz$') {
    Log "  ignorado (nombre inesperado): $name" "Yellow"
    continue
  }
  $day  = "$($Matches[1])-$($Matches[2])-$($Matches[3])"
  $time = $Matches[4]

  # Un solo archivo por dia: el mas nuevo (la lista ya viene ordenada -t)
  if ($seenDays.ContainsKey($day)) { continue }
  $seenDays[$day] = $name

  $destDir  = Join-Path $LocalDir $day
  $destFile = Join-Path $destDir "kurate-backup-$day.gz"

  if ((Test-Path $destFile) -and -not $Force) {
    $localLen = (Get-Item $destFile).Length
    if ($localLen -gt $MinBytes -and (Test-Gzip $destFile)) {
      Log "  ya existe: $day ($([math]::Round($localLen / 1MB, 2)) MB)"
      $skipped++
      continue
    }
    Log "  local invalido, se vuelve a bajar: $day" "Yellow"
  }

  if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

  Log "  bajando $name -> $destFile"
  & scp @ScpOpts "${Target}:$remote" $destFile 2>$null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $destFile)) {
    Log "  ERROR: scp fallo para $name" "Red"
    $failed++
    continue
  }

  $len = (Get-Item $destFile).Length
  if ($len -lt $MinBytes -or -not (Test-Gzip $destFile)) {
    Log "  ERROR: $day no es un gzip valido ($len bytes) - se borra" "Red"
    Remove-Item $destFile -Force -ErrorAction SilentlyContinue
    $failed++
    continue
  }

  Log "  OK: $day ($([math]::Round($len / 1MB, 2)) MB)" "Green"
  $downloaded++
}

# 2) Retencion local
$cutoff = (Get-Date).Date.AddDays(-$RetentionDays)
Get-ChildItem $LocalDir -Directory -ErrorAction SilentlyContinue | ForEach-Object {
  $d = $null
  try { $d = [datetime]::ParseExact($_.Name, 'yyyy-MM-dd', [Globalization.CultureInfo]::InvariantCulture) } catch { $d = $null }
  if ($d -and $d -lt $cutoff) {
    Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
    Log "  retencion: borrado $($_.Name)" "DarkGray"
  }
}

$totalDays = (Get-ChildItem $LocalDir -Directory -ErrorAction SilentlyContinue).Count
Log "=== fin: $downloaded nuevos, $skipped al dia, $failed errores | $totalDays dias archivados ===" "Cyan"

if ($failed -gt 0) { exit 1 }
exit 0

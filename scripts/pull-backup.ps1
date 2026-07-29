# KuraTe - Download daily backup from VPS
# Schedule via Windows Task Scheduler (daily after VPS backup at 03:00 UTC = 00:00 ART)

$ErrorActionPreference = "Stop"

$VpsIp = "192.168.1.67"
$User = "root"
$KeyPath = "$HOME\.ssh\id_kurate_rsa"
$BackupDir = "D:\FullMinent\backups"
$RemoteBackupDir = "/root/KuraTe-platform/backups"
$LogFile = "$BackupDir\pull-backups.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -ErrorAction SilentlyContinue
}

# Ensure local backup dir exists
if (-not (Test-Path $BackupDir)) { New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null }

# Find latest backup on VPS
Log "Connecting to VPS..."
$latest = ssh -i $KeyPath -o ConnectTimeout=10 "$User@$VpsIp" "ls -t $RemoteBackupDir/mongo_*.gz 2>/dev/null | head -1"
if (-not $latest) {
    Log "ERROR: No backup found on VPS"
    exit 1
}

$filename = Split-Path $latest -Leaf
$localPath = Join-Path $BackupDir $filename

# Check if already downloaded
if (Test-Path $localPath) {
    Log "Already exists: $filename - skipping"
    exit 0
}

# Download
Log "Downloading $filename..."
scp -i $KeyPath "$User@${VpsIp}:${latest}" $localPath 2>$null
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: SCP failed"
    exit 1
}

$sizeMB = [math]::Round((Get-Item $localPath).Length / 1MB, 2)
Log "Downloaded: $filename ($sizeMB MB)"

# Cleanup local backups older than 7 days
Get-ChildItem $BackupDir -Filter "mongo_*.gz" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | ForEach-Object {
    Remove-Item $_.FullName -Force
    Log "Cleaned old: $($_.Name)"
}

Log "Done"

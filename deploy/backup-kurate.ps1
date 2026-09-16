# KuraTe Daily MongoDB Backup
# Runs via Windows Task Scheduler daily at 3:00 AM
# Backs up to D:\KuraTe-backups\ with 7-day retention
# Uses docker exec to run mongodump inside the MongoDB container

$ErrorActionPreference = 'Stop'

# --- Config ---
$BackupRoot = 'D:\KuraTe-backups'
$RetentionDays = 7
$ContainerName = 'KuraTe_mongo'
$MongoUser = 'kurateApp'
$MongoPass = 'Kurate2026Secure!'
$MongoAuthDb = 'admin'
$MongoDb = 'KuraTe'
$Date = Get-Date -Format 'yyyy-MM-dd_HHmm'
$BackupDir = Join-Path $BackupRoot "kurate_$Date"
$LogDir = Join-Path $BackupRoot 'logs'
$LogFile = Join-Path $LogDir "backup_$(Get-Date -Format 'yyyy-MM-dd').log"

# --- Ensure directories ---
if (!(Test-Path $BackupRoot)) { New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null }
if (!(Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

function Write-Log($msg) {
    $ts = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "[$ts] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line
}

Write-Log "=== Backup started ==="

# --- Create temp backup dir on host for docker cp ---
$TempDir = Join-Path $env:TEMP "kurate_backup_$Date"
if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

try {
    Write-Log "Running mongodump inside container $ContainerName"

    # Clean up any previous temp backup in container
    docker exec $ContainerName rm -rf /tmp/kurate_backup 2>$null

    # Run mongodump inside the container
    # Note: mongodump logs to stderr, this is normal - suppress errors temporarily
    $ErrorActionPreferenceBackup = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker exec $ContainerName mongodump `
        --username $MongoUser `
        --password $MongoPass `
        --authenticationDatabase $MongoAuthDb `
        --db $MongoDb `
        --out /tmp/kurate_backup `
        --gzip 2>$null
    $ErrorActionPreference = $ErrorActionPreferenceBackup

    # Verify backup files exist
    $filesExist = docker exec $ContainerName test -d /tmp/kurate_backup/KuraTe 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "mongodump failed - backup directory not created"
    }

    # Copy backup from container to host
    docker cp "${ContainerName}:/tmp/kurate_backup/." "$TempDir" 2>&1 | Out-Null

    # Move to final location
    if (Test-Path $BackupDir) { Remove-Item $BackupDir -Recurse -Force }
    Move-Item $TempDir $BackupDir

    # Clean up container temp
    docker exec $ContainerName rm -rf /tmp/kurate_backup 2>&1 | Out-Null

    $size = (Get-ChildItem $BackupDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
    $sizeMB = [math]::Round($size / 1MB, 2)
    Write-Log "Backup completed: $sizeMB MB"
} catch {
    Write-Log "ERROR: $($_.Exception.Message)"
    # Clean up
    if (Test-Path $TempDir) { Remove-Item $TempDir -Recurse -Force }
    if (Test-Path $BackupDir) { Remove-Item $BackupDir -Recurse -Force }
    docker exec $ContainerName rm -rf /tmp/kurate_backup 2>&1 | Out-Null
    exit 1
}

# --- Retention: delete backups older than 7 days ---
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$oldBackups = Get-ChildItem $BackupRoot -Directory | Where-Object {
    $_.Name -like 'kurate_*' -and $_.CreationTime -lt $cutoff
}

if ($oldBackups.Count -gt 0) {
    Write-Log "Cleaning up $($oldBackups.Count) old backup(s) (>$RetentionDays days)"
    foreach ($old in $oldBackups) {
        Remove-Item $old.FullName -Recurse -Force
        Write-Log "  Deleted: $($old.Name)"
    }
} else {
    Write-Log "No old backups to clean"
}

# --- Summary ---
$totalBackups = (Get-ChildItem $BackupRoot -Directory | Where-Object { $_.Name -like 'kurate_*' }).Count
$totalSize = (Get-ChildItem $BackupRoot -Directory | Where-Object { $_.Name -like 'kurate_*' } | ForEach-Object {
    (Get-ChildItem $_.FullName -Recurse -File | Measure-Object -Property Length -Sum).Sum
} | Measure-Object -Sum).Sum

$sizeGB = if ($totalSize) { [math]::Round($totalSize / 1GB, 2) } else { 0 }
Write-Log "Total backups: $totalBackups | Total size: $sizeGB GB"
Write-Log "=== Backup finished ==="

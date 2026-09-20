# KuraTe Production MongoDB Daily Backup
# Dumps KuraTe database from 192.168.1.95 and stores locally

$ErrorActionPreference = 'Stop'
$REMOTE_HOST = 'root@192.168.1.95'
$SSH_KEY = 'C:\Users\Administrator\.ssh\id_kurate_rsa'
$LOCAL_BACKUP_DIR = 'D:\FullMinent\DB-BACK'
$DB_USER = 'kurateApp'
$DB_PASS = 'Kurate2026Secure!'
$DB_NAME = 'KuraTe'
$DATE = Get-Date -Format 'yyyy-MM-dd'
$REMOTE_DUMP = "/tmp/kurate-backup-$DATE"
$LOCAL_DUMP = Join-Path $LOCAL_BACKUP_DIR $DATE

# Ensure local backup dir exists
if (!(Test-Path $LOCAL_BACKUP_DIR)) { New-Item -ItemType Directory -Path $LOCAL_BACKUP_DIR -Force | Out-Null }

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting KuraTe backup..."

# Step 1: Run mongodump on production (single archive file)
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Dumping database on remote server..."
$dumpCmd = "docker exec KuraTe_mongo mongodump --username=$DB_USER --password='$DB_PASS' --authenticationDatabase=admin --archive=/tmp/kurate-backup-$DATE.gz --gzip 2>&1"
ssh -i $SSH_KEY -o ConnectTimeout=15 -o StrictHostKeyChecking=no $REMOTE_HOST $dumpCmd

if ($LASTEXITCODE -ne 0) { throw "mongodump failed on remote server" }

# Step 2: Copy archive from container to host
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Copying dump from container..."
ssh -i $SSH_KEY -o ConnectTimeout=15 -o StrictHostKeyChecking=no $REMOTE_HOST "docker cp KuraTe_mongo:/tmp/kurate-backup-$DATE.gz /tmp/kurate-backup-$DATE.gz"

# Step 3: SCP the archive locally
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Downloading backup..."
if (!(Test-Path $LOCAL_DUMP)) { New-Item -ItemType Directory -Path $LOCAL_DUMP -Force | Out-Null }
scp -i $SSH_KEY -o ConnectTimeout=30 -o StrictHostKeyChecking=no "${REMOTE_HOST}:/tmp/kurate-backup-$DATE.gz" "$LOCAL_DUMP\kurate-backup-$DATE.gz"

if ($LASTEXITCODE -ne 0) { throw "SCP download failed" }

# Step 3: Clean up remote temp files
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Cleaning up remote temp files..."
ssh -i $SSH_KEY -o ConnectTimeout=15 -o StrictHostKeyChecking=no $REMOTE_HOST "docker exec KuraTe_mongo rm -f /tmp/kurate-backup-$DATE.gz; rm -f /tmp/kurate-backup-$DATE.gz"

# Step 4: Report
$archive = Join-Path $LOCAL_DUMP "kurate-backup-$DATE.gz"
if (Test-Path $archive) {
    $size = (Get-Item $archive).Length
    $sizeMB = [math]::Round($size / 1MB, 2)
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup complete: $archive ($sizeMB MB)"
} else {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup complete: $LOCAL_DUMP"
}

# Step 8: Cleanup old backups (keep last 30 days)
$cutoff = (Get-Date).AddDays(-7)
Get-ChildItem $LOCAL_BACKUP_DIR -Directory | Where-Object {
    try { [datetime]::ParseExact($_.Name, 'yyyy-MM-dd', $null) -lt $cutoff } catch { $false }
} | ForEach-Object {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Removing old backup: $($_.Name)"
    Remove-Item $_.FullName -Recurse -Force
}

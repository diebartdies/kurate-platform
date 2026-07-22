param(
  [string]$VpsIp     = "kurate.drsrv.net.ar",
  [string]$User      = "root",
  [string]$KeyPath   = "$HOME\.ssh\id_rsa",
  [int]$SshPort      = 22,
  [string]$LocalDir  = "D:\KuraTe-platform"
)

$ErrorActionPreference = "Stop"

$ScpOpts = @(
  "-i", $KeyPath,
  "-P", "$SshPort",
  "-o", "BatchMode=yes",
  "-o", "StrictHostKeyChecking=accept-new"
)
$Target = "$User@$VpsIp"

mkdir -Force $LocalDir

Write-Host "Downloading backups from $Target..." -ForegroundColor Cyan

$remoteFiles = ssh @ScpOpts $Target "ls -t /root/KuraTe_backups/*.archive 2>/dev/null" 2>$null
if (-not $remoteFiles) {
  Write-Host "No backups found on server." -ForegroundColor Yellow
  exit 0
}

$count = 0
foreach ($f in $remoteFiles) {
  $name = Split-Path $f -Leaf
  $local = Join-Path $LocalDir $name
  if (-not (Test-Path $local)) {
    scp @ScpOpts "${Target}:$f" $local
    Write-Host "  Downloaded: $name" -ForegroundColor Green
    $count++
  }
}

Write-Host "Done. $count new backup(s) downloaded to $LocalDir" -ForegroundColor Cyan

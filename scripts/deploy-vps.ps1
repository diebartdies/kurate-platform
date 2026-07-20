<#
.SYNOPSIS
  Deploy KuraTe to a remote VPS over SSH (build + restart on the server).

.DESCRIPTION
  Packages the project (excluding heavy/local-only files), uploads it via scp,
  verifies the sha256 checksum on the server, extracts it, and rebuilds the
  Docker stack using the existing deploy-restart.sh flow.

  Fails fast if the VPS is not reachable (single SSH probe, no retry loop).

.PARAMETER VpsIp
  Target VPS IP. Default: 192.168.1.67

.PARAMETER User
  SSH user. Default: root

.PARAMETER KeyPath
  Path to the SSH private key. Default: $HOME\.ssh\id_rsa

.PARAMETER DeployDir
  Remote deploy directory. Default: /root/KuraTe-platform

.PARAMETER SshPort
  SSH port. Default: 22

.PARAMETER SkipBuild
  Upload files only; do not rebuild/restart containers on the server.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\deploy-vps.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\deploy-vps.ps1 -KeyPath C:\keys\kurate_vps
#>
param(
  [string]$VpsIp      = "192.168.1.67",
  [string]$User       = "root",
  [string]$KeyPath    = "$HOME\.ssh\id_rsa",
  [string]$DeployDir  = "/root/KuraTe-platform",
  [int]$SshPort       = 22,
  [switch]$SkipBuild,
  [switch]$UseAgent
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Pkg  = Join-Path $env:TEMP "kurate_upload_package.tar.gz"

function Write-Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Yellow }
function Write-Ok($msg)       { Write-Host "      $msg" -ForegroundColor Green }
function Write-Info($msg)     { Write-Host "      $msg" -ForegroundColor Gray }
function Die($msg) { Write-Host "`nERROR: $msg" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  KuraTe - Deploy to VPS" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Info "Target:     $User@$VpsIp:$SshPort"
Write-Info "Deploy dir: $DeployDir"
Write-Info "Project:    $Root"

# --- Preconditions ---------------------------------------------------------
foreach ($tool in @("ssh", "scp", "tar")) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Die "'$tool' not found on PATH. Install OpenSSH client / tar."
  }
}
# When -UseAgent is set, rely on ssh-agent for the (passphrase-protected) key:
# do NOT pass -i and do NOT use BatchMode (agent supplies the decrypted key).
if ($UseAgent) {
  Write-Info "Auth mode: ssh-agent (key must be loaded via 'ssh-add')"
  $SshOpts = @(
    "-p", "$SshPort",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10"
  )
  $ScpOpts = @(
    "-P", "$SshPort",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10"
  )
} else {
  if (-not (Test-Path $KeyPath)) {
    Die "SSH key not found: $KeyPath  (pass -KeyPath <path> or use -UseAgent)"
  }
  Write-Info "Auth mode: key file ($KeyPath)"
  $SshOpts = @(
    "-i", $KeyPath,
    "-p", "$SshPort",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10"
  )
  $ScpOpts = @(
    "-i", $KeyPath,
    "-P", "$SshPort",
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ConnectTimeout=10"
  )
}
$Target = "$User@$VpsIp"

# --- Step 1: Probe VPS (fail fast) -----------------------------------------
Write-Step "1/6" "Probing VPS availability..."
& ssh @SshOpts $Target "echo ok" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
  Die "VPS $VpsIp is not reachable over SSH (port $SshPort). It may not be online yet. Aborting."
}
Write-Ok "VPS reachable."

# --- Step 2: Package project ------------------------------------------------
Write-Step "2/6" "Packaging project (excluding node_modules, android, ios, .git, apk)..."
if (Test-Path $Pkg) { Remove-Item $Pkg -Force }

# What NOT to ship. .env / certbot / nginx ARE shipped (server needs them).
$excludes = @(
  "node_modules", ".git", "android", "ios", "*.apk", "*.aab",
  ".cache", ".wwebjs_auth", "coverage", ".nyc_output",
  ".vscode", ".DS_Store", "Thumbs.db", "*.log",
  (Split-Path $Pkg -Leaf)
)
$tarArgs = @("-czf", $Pkg)
foreach ($e in $excludes) { $tarArgs += @("--exclude=$e") }
$tarArgs += @("-C", $Root, ".")

& tar @tarArgs
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Pkg)) { Die "tar packaging failed." }
$sizeMB = [math]::Round((Get-Item $Pkg).Length / 1MB, 1)
Write-Ok "Package created: $Pkg ($sizeMB MB)"

# --- Step 3: Compute checksum ----------------------------------------------
Write-Step "3/6" "Computing sha256 checksum..."
$checksum = (Get-FileHash -Algorithm SHA256 -LiteralPath $Pkg).Hash.ToLower()
Write-Info $checksum

# --- Step 4: Ensure remote dir + upload ------------------------------------
Write-Step "4/6" "Uploading package..."
& ssh @SshOpts $Target "mkdir -p '$DeployDir'"
if ($LASTEXITCODE -ne 0) { Die "Could not create remote dir $DeployDir." }

& scp @ScpOpts $Pkg "${Target}:$DeployDir/upload_package.tar.gz"
if ($LASTEXITCODE -ne 0) { Die "scp upload failed." }
Write-Ok "Uploaded to $DeployDir/upload_package.tar.gz"

# --- Step 5: Verify checksum + extract on server ---------------------------
Write-Step "5/6" "Verifying checksum and extracting on server..."
$extractCmd = "bash '$DeployDir/scripts/deploy-extract.sh' '$checksum' '$DeployDir'"
& ssh @SshOpts $Target $extractCmd
if ($LASTEXITCODE -ne 0) {
  Die "Remote extract/checksum failed. Package left on server for inspection."
}
Write-Ok "Files extracted on server."

# Make shell scripts executable (Windows tar can drop the +x bit)
& ssh @SshOpts $Target "chmod +x '$DeployDir'/scripts/*.sh 2>/dev/null || true"

# --- Step 6: Build + restart stack -----------------------------------------
if ($SkipBuild) {
  Write-Step "6/6" "Skip build (-SkipBuild). Files uploaded only."
} else {
  Write-Step "6/6" "Building and restarting Docker stack on server..."
  Write-Info "Running deploy-restart.sh (this can take a few minutes)..."
  & ssh @SshOpts $Target "INSTALL_TWILIO=1 bash '$DeployDir/scripts/deploy-restart.sh' '$DeployDir'"
  if ($LASTEXITCODE -ne 0) {
    Die "Remote build/restart failed. Check server logs: ssh $Target 'docker logs KuraTe_app --tail 40'"
  }
  Write-Ok "Stack rebuilt and restarted."
}

# --- Cleanup ---------------------------------------------------------------
Remove-Item $Pkg -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Deploy to VPS complete!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Info "Verify:  ssh $Target 'docker ps --filter name=KuraTe'"
Write-Info "Logs:    ssh $Target 'docker logs KuraTe_app --tail 40'"
Write-Host ""

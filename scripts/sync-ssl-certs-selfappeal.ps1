# Sync FullMinent TLS files into certbot layout for nginx (fullchain.pem + privkey.pem).
# Default source: D:\Certs-Selfapeal (override with FullMinent_CERTS_DIR).

$ErrorActionPreference = 'Stop'

$SourceDir = if ($env:FullMinent_CERTS_DIR) { $env:FullMinent_CERTS_DIR } else { 'D:\Certs-Selfapeal' }
$TargetDir = Join-Path $PSScriptRoot '..\certbot\conf\live\FullMinent.drsrv.net.ar'
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
$TargetDir = (Resolve-Path $TargetDir).Path

$chainSrc = Join-Path $SourceDir 'selfa.chain'
$keySrc = Join-Path $SourceDir 'selfa.key'
$certSrc = Join-Path $SourceDir 'selfa.cert'
$caSrc = Join-Path $SourceDir 'selfa.CA'
$fullchain = Join-Path $TargetDir 'fullchain.pem'
$privkey = Join-Path $TargetDir 'privkey.pem'

if (-not (Test-Path $keySrc)) {
    Write-Error "Missing $keySrc - set FullMinent_CERTS_DIR or place selfa.key in D:\Certs-Selfapeal"
}

if (Test-Path $chainSrc) {
    Copy-Item $chainSrc $fullchain -Force
} elseif ((Test-Path $certSrc) -and (Test-Path $caSrc)) {
    Write-Host 'selfa.chain not found - building fullchain from selfa.cert + selfa.CA'
    $certText = [IO.File]::ReadAllText($certSrc).Trim()
    $caText = [IO.File]::ReadAllText($caSrc).Trim()
    [IO.File]::WriteAllText($fullchain, "$certText`n$caText`n")
} else {
    Write-Error "Need selfa.chain OR (selfa.cert + selfa.CA) in $SourceDir"
}

Copy-Item $keySrc $privkey -Force

$certCount = (Select-String -Path $fullchain -Pattern 'BEGIN CERTIFICATE').Count
Write-Host "OK: $fullchain ($certCount cert(s) in chain)"
Write-Host "OK: $privkey"

if (Get-Command openssl -ErrorAction SilentlyContinue) {
    $subject = & openssl x509 -in $fullchain -noout -subject 2>$null
    $dates = & openssl x509 -in $fullchain -noout -dates 2>$null
    if ($subject) { Write-Host "Subject: $subject" }
    if ($dates) { Write-Host $dates }
    $san = & openssl x509 -in $fullchain -noout -ext subjectAltName 2>$null
    if ($san) { Write-Host $san }
    $hostOk = ($subject -match 'FullMinent') -or ($san -match 'FullMinent')
    if (-not $hostOk) {
        Write-Warning 'Certificate is not issued for FullMinent.drsrv.net.ar - renew with certbot for that hostname.'
    } else {
        Write-Host 'OK: certificate matches FullMinent.drsrv.net.ar'
    }
}

Write-Host 'Upload to Moldova prod with scripts/upload-ssl-certs-to-prod.bat (or upload_to_server.bat).'

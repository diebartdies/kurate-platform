# Sync Let's Encrypt source files into the names nginx/docker expect.
# Run before upload or after renewing FullMinent.cer / FullMinent.chain on the server.

$ErrorActionPreference = 'Stop'
$CertDir = Join-Path $PSScriptRoot '..\certbot\conf\live\FullMinent.drsrv.net.ar' | Resolve-Path

$chainSrc = Join-Path $CertDir 'FullMinent.chain'
$keySrc = Join-Path $CertDir 'FullMinent.key'
$fullchain = Join-Path $CertDir 'fullchain.pem'
$privkey = Join-Path $CertDir 'privkey.pem'

if (-not (Test-Path $chainSrc)) {
    Write-Error "Missing $chainSrc - obtain/renew certs first."
}
if (-not (Test-Path $keySrc)) {
    Write-Error "Missing $keySrc - obtain/renew certs first."
}

Copy-Item $fullchain "$fullchain.selfsigned.bak" -Force -ErrorAction SilentlyContinue
Copy-Item $privkey "$privkey.selfsigned.bak" -Force -ErrorAction SilentlyContinue

Copy-Item $chainSrc $fullchain -Force
Copy-Item $keySrc $privkey -Force

$certCount = (Select-String -Path $fullchain -Pattern 'BEGIN CERTIFICATE').Count
Write-Host "OK: $fullchain ($certCount cert(s) in chain)"
Write-Host "OK: $privkey"
Write-Host 'Nginx on Moldova prod reads these after upload-ssl-certs-to-prod.bat (fullchain.pem + privkey.pem).'

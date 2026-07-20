Write-Host "Deteniendo stack KuraTe..." -ForegroundColor Yellow
docker compose -f (Join-Path $PSScriptRoot "..\docker-compose.yml") down 2>$null
docker rm -f kurate-nginx 2>$null
Write-Host "OK" -ForegroundColor Green
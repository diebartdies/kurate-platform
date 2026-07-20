Write-Host "=== KuraTe - nginx Reverse Proxy ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "nginx now runs as part of the docker-compose stack."
Write-Host "Use deploy-local.ps1 to start everything, or run:"
Write-Host ""
Write-Host "  docker compose up -d --build"  -ForegroundColor Yellow
Write-Host ""
Write-Host "Access: http://localhost:8080" -ForegroundColor Green
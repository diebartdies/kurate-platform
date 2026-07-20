@echo off
chcp 65001 >nul 2>&1
echo.
echo ========================================
echo   KuraTe - Reiniciar App
echo ========================================
echo.
docker compose restart app
echo.
docker ps --filter "name=KuraTe" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo.
pause

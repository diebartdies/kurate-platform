@echo off
chcp 65001 >nul 2>&1
echo.
echo ========================================
echo   KuraTe - Estado de Containers
echo ========================================
echo.
docker ps -a --filter "name=KuraTe" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"
echo.
echo Logs del app (ultimas 20 lineas):
echo ----------------------------------------
docker logs KuraTe_app --tail 20 2>&1
echo.
pause

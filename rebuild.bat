@echo off
chcp 65001 >nul 2>&1
echo.
echo ========================================
echo   KuraTe - Rebuild Completo
echo ========================================
echo.
echo Deteniendo containers...
docker compose down 2>nul
echo Eliminando imagenes...
docker rmi fullminent-app:latest 2>nul
echo Limpiando cache de Docker...
docker builder prune -f 2>nul
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-local.ps1" %*

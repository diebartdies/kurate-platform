@echo off
setlocal EnableExtensions
echo ===================================================
echo TLS only — sync + upload to Moldova prod server
echo ===================================================
call "%~dp0upload-ssl-certs-to-prod.bat"
if errorlevel 1 exit /b 1
echo.
echo Next: run fix-nginx-now.bat or upload_to_server.bat to reload nginx.
endlocal

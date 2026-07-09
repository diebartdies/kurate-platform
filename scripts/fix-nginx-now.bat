@echo off
setlocal EnableExtensions
echo ===================================================
echo Fix nginx restart loop (config + certs to Moldova prod)
echo ===================================================

set SERVER_USER=root
set SERVER_IP=91.208.206.35
set SERVER_PATH=/root/FullMinent-platform
set SSH_OPTS=-o ConnectTimeout=60 -o ServerAliveInterval=15 -o ServerAliveCountMax=480

echo [1/5] Sync + upload ALL TLS (FullMinent + FullMinent) to prod server...
call "%~dp0upload-ssl-certs-to-prod.bat"
if errorlevel 1 exit /b 1

echo [2/5] Upload nginx.conf, docker-compose.yml, fix script...
scp %SSH_OPTS% "%~dp0..\nginx.conf" "%~dp0..\docker-compose.yml" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%~dp0fix-nginx-now.sh" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/scripts/
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%~dp0nginx-write-FullMinent-conf.sh" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/scripts/
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%~dp0..\nginx\conf.d\FullMinent.ssl.conf" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/nginx/conf.d/
if errorlevel 1 exit /b 1

echo [3/5] Normalize line endings...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "sed -i 's/\r$//' %SERVER_PATH%/scripts/fix-nginx-now.sh %SERVER_PATH%/scripts/nginx-write-FullMinent-conf.sh && chmod +x %SERVER_PATH%/scripts/fix-nginx-now.sh %SERVER_PATH%/scripts/nginx-write-FullMinent-conf.sh"

echo [4/5] Run fix on Moldova prod server...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "bash %SERVER_PATH%/scripts/fix-nginx-now.sh %SERVER_PATH%"
if errorlevel 1 exit /b 1

echo.
echo OK: certs + nginx on prod (%SERVER_IP%). Test both HTTPS URLs.
endlocal

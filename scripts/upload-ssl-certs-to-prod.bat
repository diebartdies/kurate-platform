@echo off
setlocal EnableExtensions
rem Upload TLS material to Moldova production VPS (nginx reads certbot/conf/live on the server).
rem Called by upload_to_server.bat and fix-nginx-now.bat — do not skip on full deploys.

if not defined SERVER_USER set SERVER_USER=root
if not defined SERVER_IP set SERVER_IP=91.208.206.35
if not defined SERVER_PATH set SERVER_PATH=/root/FullMinent-platform
if not defined SSH_OPTS set SSH_OPTS=-o ConnectTimeout=60 -o ServerAliveInterval=15 -o ServerAliveCountMax=480 -o TCPKeepAlive=yes

set SCRIPT_DIR=%~dp0
set REPO_ROOT=%SCRIPT_DIR%..

echo [TLS] Syncing FullMinent certs locally (FullMinent.chain/key -^> fullchain.pem/privkey.pem)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%sync-ssl-certs.ps1"
if errorlevel 1 exit /b 1

echo [TLS] Syncing FullMinent certs locally (D:\Certs-Selfapeal -^> fullchain.pem/privkey.pem)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%sync-ssl-certs-FullMinent.ps1"
if errorlevel 1 exit /b 1

echo [TLS] Uploading FullMinent cert + key to %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/certbot/conf/live/FullMinent.drsrv.net.ar/
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "mkdir -p %SERVER_PATH%/certbot/conf/live/FullMinent.drsrv.net.ar"
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%REPO_ROOT%\certbot\conf\live\FullMinent.drsrv.net.ar\fullchain.pem" "%REPO_ROOT%\certbot\conf\live\FullMinent.drsrv.net.ar\privkey.pem" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/certbot/conf/live/FullMinent.drsrv.net.ar/
if errorlevel 1 exit /b 1

echo [TLS] Uploading FullMinent cert + key to %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/certbot/conf/live/FullMinent.drsrv.net.ar/
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "mkdir -p %SERVER_PATH%/certbot/conf/live/FullMinent.drsrv.net.ar"
if errorlevel 1 exit /b 1
scp %SSH_OPTS% "%REPO_ROOT%\certbot\conf\live\FullMinent.drsrv.net.ar\fullchain.pem" "%REPO_ROOT%\certbot\conf\live\FullMinent.drsrv.net.ar\privkey.pem" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/certbot/conf/live/FullMinent.drsrv.net.ar/
if errorlevel 1 exit /b 1

echo [TLS] OK: both domains on Moldova prod (FullMinent + FullMinent, fullchain.pem + privkey.pem each).
endlocal

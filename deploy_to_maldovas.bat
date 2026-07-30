@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ===================================================
echo KuraTe - Maldovas Deploy Script v1.0
echo ===================================================
echo.

:: Server configuration
set SERVER_USER=root
set SERVER_IP=91.208.206.35
set SERVER_PATH=/root/KuraTe-platform
set SSH_OPTS=-o ConnectTimeout=60 -o ServerAliveInterval=15 -o ServerAliveCountMax=480 -o TCPKeepAlive=yes

echo [1/7] Running setup script on server...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "bash /root/KuraTe-platform/scripts/setup-maldovas.sh" 2>&1
if errorlevel 1 (
    echo WARN: Setup script had issues, continuing...
)

echo.
echo [2/7] Compressing project files locally...
tar -czf upload_package.tar.gz --exclude=node_modules --exclude=.git --exclude=.cache --exclude=.wwebjs_auth --exclude=android --exclude=ios --exclude=upload_package.tar.gz --exclude=docker-compose.override.yml --exclude=*.archive --exclude=*.tar.gz --exclude=certbot --exclude=KurateCerts --exclude=kurate-app/node_modules .
if errorlevel 1 goto archive_failed

echo.
echo [3/7] Calculating local file checksum (SHA256)...
set "LOCAL_CHECKSUM="
for /f "skip=1 delims=" %%A in ('certutil -hashfile upload_package.tar.gz SHA256 2^>nul') do (
    if not defined LOCAL_CHECKSUM set "LOCAL_CHECKSUM=%%A"
)
set "LOCAL_CHECKSUM=!LOCAL_CHECKSUM: =!"
if "!LOCAL_CHECKSUM!"=="" goto checksum_failed
echo Local Checksum: !LOCAL_CHECKSUM!

echo.
echo [4/7] Uploading package and deploy helpers...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "mkdir -p %SERVER_PATH%/scripts"
if errorlevel 1 goto upload_failed

scp %SSH_OPTS% upload_package.tar.gz %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/
if errorlevel 1 goto upload_failed

scp %SSH_OPTS% "%~dp0scripts\deploy-restart.sh" "%~dp0scripts\deploy-extract.sh" "%~dp0scripts\disk-housekeeping.sh" "%~dp0scripts\install-housekeeping-cron.sh" "%~dp0scripts\install-daily-backup-cron.sh" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/scripts/
if errorlevel 1 goto upload_failed

ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "sed -i 's/\r$//' %SERVER_PATH%/scripts/*.sh && chmod +x %SERVER_PATH%/scripts/*.sh"

echo.
echo [5/7] Verifying and extracting on server...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "bash %SERVER_PATH%/scripts/deploy-extract.sh !LOCAL_CHECKSUM! %SERVER_PATH%"
if errorlevel 1 goto extract_failed

echo.
echo [5b/7] Disk housekeeping...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "bash %SERVER_PATH%/scripts/disk-housekeeping.sh %SERVER_PATH%" 2>&1 || true

echo.
echo [6/7] Building and starting Docker stack...
echo     This takes 4-8 minutes. Do NOT press Ctrl+C.
set "DEPLOY_CMD=INSTALL_TWILIO=1 bash %SERVER_PATH%/scripts/deploy-restart.sh %SERVER_PATH%"
ssh %SSH_OPTS% -o ServerAliveCountMax=480 %SERVER_USER%@%SERVER_IP% "!DEPLOY_CMD!"
if errorlevel 1 goto docker_failed

echo.
echo [7/7] Restoring MongoDB dump...
scp %SSH_OPTS% "%~dp0backups\sexappeal_final_backup_2026-07-30.gz" %SERVER_USER%@%SERVER_IP%:/tmp/kurate_dump.gz 2>&1 || true
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "gunzip -c /tmp/kurate_dump.gz | docker exec -i KuraTe_mongo mongorestore --gzip --archive 2>/dev/null && rm -f /tmp/kurate_dump.gz" 2>&1 || echo WARN: Dump restore skipped or failed

echo.
echo ===================================================
echo DEPLOYMENT COMPLETE!
echo ===================================================
echo Domain: https://kurate.drsrv.net.ar
echo Server: %SERVER_IP%
echo.
goto cleanup

:archive_failed
echo ERROR: Failed to create archive.
goto cleanup

:checksum_failed
echo ERROR: Could not compute local checksum.
goto cleanup

:upload_failed
echo ERROR: Failed to upload files to server.
goto cleanup

:extract_failed
echo ERROR: Checksum mismatch or extract error.
goto cleanup

:docker_failed
echo ERROR: Docker build/start failed.
goto cleanup

:cleanup
echo.
echo Cleaning up local temporary files...
if exist upload_package.tar.gz del upload_package.tar.gz
echo Done.
pause

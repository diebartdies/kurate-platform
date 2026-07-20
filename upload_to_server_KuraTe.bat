@echo off
setlocal EnableExtensions EnableDelayedExpansion

echo ===================================================
echo KuraTe - Automated Deployment Script v1.0
echo ===================================================
echo.

:: Server configuration
set SERVER_USER=root
set SERVER_IP=192.168.1.67
set SERVER_PATH=/root/KuraTe-platform
set SSH_OPTS=-o ConnectTimeout=60 -o ServerAliveInterval=15 -o ServerAliveCountMax=480 -o TCPKeepAlive=yes

echo [1/6] Normalizing deploy script line endings (LF)...
powershell -NoProfile -Command "$paths=@('%~dp0scripts\deploy-extract.sh','%~dp0scripts\deploy-restart.sh','%~dp0scripts\disk-housekeeping.sh','%~dp0scripts\install-housekeeping-cron.sh','%~dp0scripts\git-backup-push.sh','%~dp0scripts\install-git-backup-cron.sh','%~dp0scripts\install-daily-backup-cron.sh','%~dp0scripts\nginx-write-selfappeal-conf.sh','%~dp0scripts\nginx-emergency-fix.sh','%~dp0scripts\fix-nginx-now.sh','%~dp0scripts\set-twilio-whatsapp-template.sh'); foreach($p in $paths){ if(-not(Test-Path $p)){continue}; $t=[IO.File]::ReadAllText($p) -replace \"`r`n\",\"`n\" -replace \"`r\",\"\"; [IO.File]::WriteAllText($p,$t,(New-Object System.Text.UTF8Encoding $false)) }"
if errorlevel 1 goto line_endings_failed

echo [2/6] Compressing project files locally (ignoring heavy/native files)...
tar -czf upload_package.tar.gz --exclude=node_modules --exclude=.git --exclude=.cache --exclude=.wwebjs_auth --exclude=android --exclude=ios --exclude=upload_package.tar.gz --exclude=docker-compose.override.yml --exclude=.env --exclude=*.archive --exclude=*.tar.gz --exclude=certbot .
if errorlevel 1 goto archive_failed

echo.
echo [3/6] Calculating local file checksum (SHA256)...
set "LOCAL_CHECKSUM="
for /f "skip=1 delims=" %%A in ('certutil -hashfile upload_package.tar.gz SHA256 2^>nul') do (
    if not defined LOCAL_CHECKSUM set "LOCAL_CHECKSUM=%%A"
)
set "LOCAL_CHECKSUM=!LOCAL_CHECKSUM: =!"
if "!LOCAL_CHECKSUM!"=="" goto checksum_failed
echo Local Checksum: !LOCAL_CHECKSUM!

echo.
echo [4/6] Uploading package and deploy helpers to the server...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "mkdir -p %SERVER_PATH%/scripts"
if errorlevel 1 goto upload_scripts_failed

scp %SSH_OPTS% upload_package.tar.gz %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/
if errorlevel 1 goto upload_archive_failed

scp %SSH_OPTS% "%~dp0scripts\deploy-extract.sh" "%~dp0scripts\deploy-restart.sh" "%~dp0scripts\disk-housekeeping.sh" "%~dp0scripts\install-housekeeping-cron.sh" "%~dp0scripts\git-backup-push.sh" "%~dp0scripts\install-git-backup-cron.sh" "%~dp0scripts\install-daily-backup-cron.sh" "%~dp0scripts\nginx-write-selfappeal-conf.sh" "%~dp0scripts\fix-nginx-now.sh" %SERVER_USER%@%SERVER_IP%:%SERVER_PATH%/scripts/
if errorlevel 1 goto upload_scripts_failed

ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "sed -i 's/\r$//' %SERVER_PATH%/scripts/deploy-extract.sh %SERVER_PATH%/scripts/deploy-restart.sh %SERVER_PATH%/scripts/disk-housekeeping.sh %SERVER_PATH%/scripts/install-housekeeping-cron.sh %SERVER_PATH%/scripts/git-backup-push.sh %SERVER_PATH%/scripts/install-git-backup-cron.sh %SERVER_PATH%/scripts/install-daily-backup-cron.sh %SERVER_PATH%/scripts/nginx-write-selfappeal-conf.sh %SERVER_PATH%/scripts/fix-nginx-now.sh"

echo.
echo [5/6] Verifying integrity and extracting on server...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "chmod +x %SERVER_PATH%/scripts/deploy-extract.sh %SERVER_PATH%/scripts/deploy-restart.sh %SERVER_PATH%/scripts/disk-housekeeping.sh %SERVER_PATH%/scripts/install-housekeeping-cron.sh %SERVER_PATH%/scripts/git-backup-push.sh %SERVER_PATH%/scripts/install-git-backup-cron.sh %SERVER_PATH%/scripts/install-daily-backup-cron.sh %SERVER_PATH%/scripts/nginx-write-selfappeal-conf.sh %SERVER_PATH%/scripts/fix-nginx-now.sh && bash %SERVER_PATH%/scripts/deploy-extract.sh !LOCAL_CHECKSUM! %SERVER_PATH%"
if errorlevel 1 goto extract_failed

echo.
echo [5b/6] Server disk housekeeping - before Docker build...
ssh %SSH_OPTS% %SERVER_USER%@%SERVER_IP% "bash %SERVER_PATH%/scripts/disk-housekeeping.sh %SERVER_PATH%"
if errorlevel 1 goto disk_failed

echo.
echo [6/6] Building and restarting containers - app and nginx...
echo     This step takes about 4-8 minutes - npm install and image export. Do NOT press Ctrl+C.
set "DEPLOY_RESTART_CMD=INSTALL_TWILIO=1 bash %SERVER_PATH%/scripts/deploy-restart.sh %SERVER_PATH%"
ssh %SSH_OPTS% -o ServerAliveCountMax=480 %SERVER_USER%@%SERVER_IP% "!DEPLOY_RESTART_CMD!"
if errorlevel 1 goto docker_failed

echo DEPLOYMENT SUCCEEDED! Application is now running the new code.
goto cleanup

:line_endings_failed
echo ERROR: Failed to normalize deploy script line endings.
goto cleanup

:archive_failed
echo ERROR: Failed to create archive.
goto cleanup

:checksum_failed
echo ERROR: Could not compute local checksum.
goto cleanup

:upload_archive_failed
echo ERROR: Failed to upload archive.
goto cleanup

:upload_scripts_failed
echo ERROR: Failed to upload deploy helper scripts (or create scripts dir on server).
goto cleanup

:extract_failed
echo ERROR: Step 5 failed - checksum mismatch or extract error.
goto cleanup

:disk_failed
echo ERROR: Disk critically low after cleanup. Run disk-housekeeping.sh on server, then retry.
goto cleanup

:docker_failed
echo ERROR: Step 6 failed - docker build/start error.
goto cleanup

:cleanup
echo.
echo Cleaning up local temporary files...
if exist upload_package.tar.gz del upload_package.tar.gz

echo.
echo [Backup] Backing up to GitHub (non-interactive)...
set GIT_TERMINAL_PROMPT=0
set GCM_INTERACTIVE=never
set GIT_OPTIONAL_LOCKS=0
git add .
git diff --cached --quiet
if errorlevel 1 goto git_commit
echo No git changes to commit - skipping commit/push.
goto end

:git_commit
git commit -m "Automated deployment update"
if errorlevel 1 goto git_commit_failed
echo n| git -c gc.auto=0 push origin HEAD 2>&1
if errorlevel 1 goto git_push_failed
echo GitHub backup successful!
goto end

:git_commit_failed
echo WARNING: git commit failed. Deploy on server is still OK.
goto end

:git_push_failed
echo WARNING: GitHub push failed (often a Windows .git file lock). Push manually if needed.
echo          Production deploy already succeeded - no action required for the live site.
goto end

:end
echo.
echo ===================================================
echo Script finished.
echo ===================================================
pause

@echo off
setlocal EnableExtensions EnableDelayedExpansion
if not defined INSTALL_TWILIO set "INSTALL_TWILIO=1"

echo ===================================================
echo Rebuilding Local SexAppeal Environment...
echo ===================================================
echo.

echo [1/4] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed.
    goto end
)

echo.
echo [2/4] Security audit and auto-fix...
call npm audit
echo.
call npm audit fix
if errorlevel 1 (
    echo WARN: npm audit fix could not resolve all issues — review output above.
) else (
    echo npm audit fix completed.
)
echo.
call npm audit
echo.

echo [3/4] Stopping local containers...
docker-compose down
if errorlevel 1 (
    echo WARN: docker-compose down returned an error.
)

echo.
echo [4/4] Building and starting containers...

rem Compose on Windows can fail AFTER a successful image build when writing
rem .tmp-compose-build-metadataFile under %TEMP% (Access is denied). Use a
rem project-local temp dir and disable bake/provenance attestation.
if not exist "%~dp0.tmp" mkdir "%~dp0.tmp"
set "TMP=%~dp0.tmp"
set "TEMP=%~dp0.tmp"
set COMPOSE_BAKE=false
set BUILDX_NO_DEFAULT_ATTESTATIONS=1
set DOCKER_BUILDKIT=1

docker-compose build --progress=plain
if errorlevel 1 (
    echo WARN: docker-compose build failed — retrying with docker build...
    docker build -t sexappeal-platform-app --build-arg "INSTALL_TWILIO=%INSTALL_TWILIO%" .
    if errorlevel 1 (
        echo ERROR: docker build failed.
        goto end
    )
)
docker-compose up -d
if errorlevel 1 (
    echo ERROR: docker-compose up failed.
    goto end
)

echo.
echo Local environment rebuilt and updated.

:end
pause

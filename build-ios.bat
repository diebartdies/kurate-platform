@echo off
chcp 65001 >nul
setlocal

echo ============================================
echo  KuraTe iOS Build (sync web assets)
echo ============================================

REM --- 1. Build the web app ---
echo.
echo [1/2] Building web app (npm run build)...
cd /d "D:\FullMinent\kurate-app"
call npm run build
if errorlevel 1 (
  echo ERROR: Web build failed.
  pause
  exit /b 1
)

REM --- 2. Sync to iOS ---
echo.
echo [2/2] Syncing to iOS platform...
cd /d "D:\FullMinent"
npx cap sync ios
if errorlevel 1 (
  echo ERROR: Capacitor sync failed.
  pause
  exit /b 1
)

echo.
echo DONE. iOS project synced.
echo.
echo To build the IPA, open ios/App/App.xcodeproj in Xcode on macOS.
echo Or run: npx cap build ios
pause

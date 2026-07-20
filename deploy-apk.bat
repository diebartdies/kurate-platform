@echo off
chcp 65001 >nul
setlocal

set "ANDROID_DIR=D:\FullMinent\android"
set "APK=%ANDROID_DIR%\app\build\outputs\apk\debug\app-debug.apk"

echo ============================================
echo  KuraTe APK Deploy  (build + install via ADB)
echo ============================================

REM --- 1. Check a phone is connected ---
echo.
echo [1/3] Checking connected devices...
adb devices | findstr /r "device$" >nul
if errorlevel 1 (
  echo ERROR: No Android device found.
  echo Connect the phone via USB and enable USB debugging, then retry.
  pause
  exit /b 1
)
adb devices

REM --- 2. Build the debug APK ---
echo.
echo [2/3] Building debug APK (gradlew assembleDebug)...
cd /d "%ANDROID_DIR%"
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo ERROR: Build failed.
  pause
  exit /b 1
)

REM --- 3. Install on the connected phone ---
echo.
echo [3/3] Installing on device...
adb install -r "%APK%"
if errorlevel 1 (
  echo ERROR: Install failed.
  pause
  exit /b 1
)

echo.
echo DONE. KuraTe APK installed on the connected phone.
pause

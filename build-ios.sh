#!/bin/bash
# KuraTe iOS Build Script (run on macOS)
# Requires: Node.js, Xcode, CocoaPods

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$SCRIPT_DIR/kurate-app"
IOS_DIR="$SCRIPT_DIR/ios"

echo "============================================"
echo " KuraTe iOS Build"
echo "============================================"

# 1. Build web assets
echo ""
echo "[1/4] Building web app..."
cd "$WEB_DIR"
npm run build

# 2. Sync Capacitor
echo ""
echo "[2/4] Syncing Capacitor iOS..."
cd "$SCRIPT_DIR"
npx cap sync ios

# 3. Install pods (if needed)
echo ""
echo "[3/4] Installing CocoaPods..."
cd "$IOS_DIR/App"
pod install --repo-update

# 4. Build Xcode project
echo ""
echo "[4/4] Building iOS app..."
xcodebuild -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath "$SCRIPT_DIR/build/KuraTe.xcarchive" \
  archive

echo ""
echo "Archive created at: build/KuraTe.xcarchive"
echo ""
echo "To create IPA:"
echo "  xcodebuild -exportArchive \\"
echo "    -archivePath build/KuraTe.xcarchive \\"
echo "    -exportOptionsPlist ExportOptions.plist \\"
echo "    -exportPath build/"
echo ""
echo "Or open ios/App/App.xcworkspace in Xcode."

#!/bin/zsh
set -e
export DEVELOPER_DIR="/Applications/Xcode-beta.app/Contents/Developer"
export CLANG_MODULE_CACHE_PATH="/private/tmp/meditation-clang-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="/private/tmp/meditation-swiftpm-cache"
swift build --disable-sandbox -c release -debug-info-format none
APP_DIR="靜心主持台.app"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"
cp .build/release/MeditationHost "$APP_DIR/Contents/MacOS/MeditationHost"
cp Info.plist "$APP_DIR/Contents/Info.plist"
cp Assets/AppIcon.icns "$APP_DIR/Contents/Resources/MeditationIconTransparentV5.icns"
cp Assets/MenuBarIcon.png "$APP_DIR/Contents/Resources/MenuBarIcon.png"
cp Resources/RemoteControl.html "$APP_DIR/Contents/Resources/RemoteControl.html"
cp Resources/BuiltInChime.m4a "$APP_DIR/Contents/Resources/BuiltInChime.m4a"
codesign --force --deep --sign - "$APP_DIR"
echo "已建立：$PWD/$APP_DIR"

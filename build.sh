#!/bin/bash
# Builds "Road Rash.app" (native macOS shell + bundled canvas game) into ./build
set -euo pipefail
cd "$(dirname "$0")"

APP="build/Road Rash.app"
# Use the Command Line Tools toolchain when Xcode's license hasn't been accepted.
if ! swiftc --version >/dev/null 2>&1 && [ -d /Library/Developer/CommandLineTools ]; then
  export DEVELOPER_DIR=/Library/Developer/CommandLineTools
fi

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"

echo "▸ compiling"
swiftc -O -target "$(uname -m)-apple-macos12.0" -framework Cocoa -framework WebKit \
  macos/main.swift -o "$APP/Contents/MacOS/RoadRash"

echo "▸ bundling resources"
cp macos/Info.plist "$APP/Contents/Info.plist"
cp web/index.html web/game.js "$APP/Contents/Resources/web/"

echo "▸ icon"
TMP="$(mktemp -d)"
qlmanage -t -s 1024 -o "$TMP" macos/icon.svg >/dev/null 2>&1 || true
if [ -f "$TMP/icon.svg.png" ]; then
  SET="$TMP/AppIcon.iconset"; mkdir -p "$SET"
  for s in 16 32 128 256 512; do
    sips -z $s $s "$TMP/icon.svg.png" --out "$SET/icon_${s}x${s}.png" >/dev/null
    sips -z $((s*2)) $((s*2)) "$TMP/icon.svg.png" --out "$SET/icon_${s}x${s}@2x.png" >/dev/null
  done
  iconutil -c icns "$SET" -o "$APP/Contents/Resources/AppIcon.icns"
else
  echo "  (icon render skipped)"
fi
rm -rf "$TMP"

echo "▸ signing (ad-hoc)"
codesign --force --deep --sign - "$APP" >/dev/null

echo "✓ built $APP"

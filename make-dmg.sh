#!/bin/bash
# Packs build/Road Rash.app into build/RoadRash.dmg (drag-to-Applications installer)
set -euo pipefail
cd "$(dirname "$0")"

APP="build/Road Rash.app"
DMG="build/RoadRash.dmg"
[ -d "$APP" ] || ./build.sh

STAGE="$(mktemp -d)"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

rm -f "$DMG"
hdiutil create -volname "Road Rash" -srcfolder "$STAGE" -fs HFS+ -format UDZO -ov "$DMG" >/dev/null
rm -rf "$STAGE"
echo "✓ built $DMG"

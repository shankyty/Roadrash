#!/bin/bash
# Builds web/ (npm run build) and publishes dist/web to the gh-pages branch, served at https://shankyty.github.io/Roadrash/
# Commit your changes to main first; this deploys what's committed.
set -euo pipefail
cd "$(dirname "$0")"

[ -z "$(git status --porcelain -- web)" ] || { echo "✗ web/ has uncommitted changes: commit them first"; exit 1; }
[ -d node_modules ] || npm ci
npm run build
REMOTE="$(git remote get-url origin)" TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R dist/web/. "$TMP"
git -C "$TMP" init -q -b gh-pages
git -C "$TMP" add -A
git -C "$TMP" -c user.name="$(git config user.name)" -c user.email="$(git config user.email)" commit -qm "Deploy $(git rev-parse --short HEAD)"
git -C "$TMP" push -qf "$REMOTE" gh-pages
echo "✓ deployed. Live in about a minute at https://shankyty.github.io/Roadrash/"

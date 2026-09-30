#!/bin/bash
# Publishes web/ to the gh-pages branch, served at https://shankyty.github.io/Roadrash/
# Commit your changes to main first; this deploys what's committed.
set -euo pipefail
cd "$(dirname "$0")"

git subtree split --prefix web -b gh-pages-deploy >/dev/null
git push -f origin gh-pages-deploy:gh-pages
git branch -D gh-pages-deploy >/dev/null
echo "✓ deployed. Live in about a minute at https://shankyty.github.io/Roadrash/"

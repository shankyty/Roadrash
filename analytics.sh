#!/bin/bash
# Prints who is playing the web version: visitors, countries (with regions), and race events.
# Needs a read-only GoatCounter API token in GOATCOUNTER_TOKEN:
#   Dashboard → Settings → API → New token → tick "Read statistics" only.
# Usage: GOATCOUNTER_TOKEN=... ./analytics.sh [days]   (default 30 days)
set -euo pipefail

SITE="https://roadrash-shankyty.goatcounter.com"
DAYS="${1:-30}"
: "${GOATCOUNTER_TOKEN:?Set GOATCOUNTER_TOKEN to a read-only GoatCounter API token}"

START="$(date -u -v-"${DAYS}"d +%Y-%m-%dT00:00:00Z 2>/dev/null || date -u -d "-${DAYS} days" +%Y-%m-%dT00:00:00Z)"
api() { curl -sf -H "Authorization: Bearer $GOATCOUNTER_TOKEN" -H 'Content-Type: application/json' "$SITE/api/v0/$1"; }

if ! api "stats/total?start=$START" >/dev/null; then
  echo "GoatCounter rejected the request. Check the token has \"Read statistics\" permission." >&2; exit 1
fi

echo "Road Rash: Rickshaw Rumble, last $DAYS days"
echo
api "stats/total?start=$START" | jq -r '"Visitors: \(.total)   (events: \(.total_events // 0))"'

echo
echo "Where players are (country · visitors · regions):"
api "stats/locations?start=$START&limit=50" | jq -r '.stats[] | "\(.id)\t\(.name)\t\(.count)"' |
while IFS=$'\t' read -r id name count; do
  regions="$(api "stats/locations/$id?start=$START&limit=10" 2>/dev/null |
    jq -r '[.stats[]? | select(.name != "") | "\(.name) \(.count)"] | join(", ")' 2>/dev/null || true)"
  printf "  %-24s %5s   %s\n" "${name:-Unknown}" "$count" "$regions"
done

echo
echo "Races (event · count):"
api "stats/hits?start=$START&limit=100" |
  jq -r '.hits[] | select(.event) | "  \(.path)\t\(.count)"' | sort -t$'\t' -k2 -nr | column -t -s$'\t'

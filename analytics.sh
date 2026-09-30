#!/bin/bash
# Who is playing the web version: visitors, where they are, devices, sources and races.
#
# No token needed: it reads a GoatCounter export.
#   1. Dashboard (https://roadrash-shankyty.goatcounter.com) → Settings → Export → download the zip
#   2. ./analytics.sh                 # uses the newest export in this folder or ~/Downloads
#      ./analytics.sh path/to/export.zip
#
# Optional live mode (skips the export): GOATCOUNTER_TOKEN=<read-only API token> ./analytics.sh --live [days]
set -euo pipefail
cd "$(dirname "$0")"
SITE="https://roadrash-shankyty.goatcounter.com"

summarise_export() {
  local zip="$1" d
  TMP_EXPORT="$(mktemp -d)"; trap 'rm -rf "${TMP_EXPORT:-}"' EXIT
  unzip -q "$zip" -d "$TMP_EXPORT"
  d="$(dirname "$(find "$TMP_EXPORT" -name info.json | head -1)")"
  [ -f "$d/paths.jsonl" ] || { echo "$zip doesn't look like a GoatCounter export." >&2; exit 1; }
  for f in paths hit_stats location_stats locations system_stats systems browser_stats browsers size_stats refs; do
    [ -f "$d/$f.jsonl" ] || : > "$d/$f.jsonl"
  done

  jq -rn \
    --slurpfile info "$d/info.json" --slurpfile paths "$d/paths.jsonl" --slurpfile hits "$d/hit_stats.jsonl" \
    --slurpfile locstats "$d/location_stats.jsonl" --slurpfile locs "$d/locations.jsonl" \
    --slurpfile sysstats "$d/system_stats.jsonl" --slurpfile systems "$d/systems.jsonl" \
    --slurpfile brstats "$d/browser_stats.jsonl" --slurpfile browsers "$d/browsers.jsonl" \
    --slurpfile sizes "$d/size_stats.jsonl" --slurpfile refs "$d/refs.jsonl" '
    def pages: [$paths[] | select(.event != true) | .id];
    def ispage: . as $id | pages | index($id) != null;
    def sumby(f): group_by(f) | map({key: (.[0] | f), n: (map(.count) | add)}) | sort_by(-.n);
    def bar(n; max): "#" * ((n * 20 / (if max == 0 then 1 else max end)) | ceil);
    def events(prefix; empty):
      [$hits[] | . as $h | ($paths[] | select(.id == $h.path_id and .event == true and (.path | startswith(prefix)))) as $p | {path: $p.path, count: $h.count}]
      | sumby(.path) as $ev | ($ev | map(.n) | max // 0) as $max
      | if ($ev | length) == 0 then empty
        else ($ev[] | "  \((.key | ltrimstr("device/") | gsub("/"; " · ")) + "                                  " | .[0:34]) \(.n | tostring | "   " + . | .[-4:])  \(bar(.n; $max))") end;

    ($locs | map({key: (if .region == "" then .country else .country + "-" + .region end), value: .}) | from_entries) as $locname
    | ($systems | map({key: (.id | tostring), value: .name}) | from_entries) as $sysname
    | ($browsers | map({key: (.id | tostring), value: .name}) | from_entries) as $brname
    | ($refs | map({key: (.id | tostring), value: .ref}) | from_entries) as $refname
    | ([$hits[] | select(.path_id | ispage) | .count] | add // 0) as $visits
    | ([$hits[].hour[0:10]] | unique) as $days

    | "Road Rash: Rickshaw Rumble, exported \($info[0].created_at[0:16] | sub("T"; " ")) UTC",
      "Period: \($days | first // "-") to \($days | last // "-")",
      "",
      "Page views: \($visits)",
      "",
      "Where players are:",
      ( [$locstats[] | select(.path_id | ispage)] | map(. + {country: (.location | split("-")[0])})
        | sumby(.country) as $countries
        | $countries[] as $c
        | "  \(($locname[$c.key].country_name // "Unknown") + "                        " | .[0:24]) \($c.n | tostring | "   " + . | .[-4:])  "
          + ( [$locstats[] | select((.path_id | ispage) and (.location | startswith($c.key + "-")))]
              | sumby(.location) | map("\($locname[.key].region_name // .key) \(.n)") | join(", ")
              | if . == "" then "(no region: enable Settings → Data collection → Location region)" else . end ) ),
      "",
      "Devices:",
      ( [$sizes[] | select(.path_id | ispage)] | map(. + {kind: (if .width == 0 then "unknown" elif .width < 600 then "phone" elif .width < 1100 then "tablet" else "computer" end)})
        | sumby(.kind)[] | "  \(.key + "          " | .[0:10]) \(.n)" ),
      "  " + ([$sysstats[] | select(.path_id | ispage)] | sumby(.system_id) | map("\($sysname[.key | tostring] // "?") \(.n)") | join(", ")),
      "  " + ([$brstats[] | select(.path_id | ispage)] | sumby(.browser_id) | map("\($brname[.key | tostring] // "?") \(.n)") | join(", ")),
      "",
      "Came from:",
      ( [$hits[] | select(.path_id | ispage)] | sumby(.ref_id)[]
        | "  \(($refname[.key | tostring] // "") | if . == "" then "direct link (WhatsApp, typed, bookmarks)" else . end)  \(.n)" ),
      "",
      "Device · OS · browser (per visit):",
      events("device/"; "  not recorded yet (added in the latest website update)"),
      "",
      "Races:",
      events("race-"; "  none yet")
  '
}

summarise_live() {
  local days="${1:-30}"
  [ -n "${GOATCOUNTER_TOKEN:-}" ] || { echo "Live mode needs GOATCOUNTER_TOKEN (a read-only API token). Without it, use an export zip instead." >&2; exit 1; }
  local start; start="$(date -u -v-"${days}"d +%Y-%m-%dT00:00:00Z 2>/dev/null || date -u -d "-${days} days" +%Y-%m-%dT00:00:00Z)"
  api() { curl -sf -H "Authorization: Bearer $GOATCOUNTER_TOKEN" "$SITE/api/v0/$1"; }
  api "stats/total?start=$start" >/dev/null || { echo "GoatCounter rejected the token." >&2; exit 1; }
  echo "Road Rash: Rickshaw Rumble, live, last $days days"
  api "stats/total?start=$start" | jq -r '"Visitors: \(.total)"'
  echo "Where players are:"
  api "stats/locations?start=$start&limit=50" | jq -r '.stats[] | "  \(.name)  \(.count)"'
  echo "Races:"
  api "stats/hits?start=$start&limit=100" | jq -r '.hits[] | select(.event) | "  \(.path)  \(.count)"'
}

if [ "${1:-}" = "--live" ]; then summarise_live "${2:-30}"; exit; fi

ZIP="${1:-}"
if [ -z "$ZIP" ]; then
  ZIP="$(ls -t ./goatcounter-export-*.zip "$HOME"/Downloads/goatcounter-export-*.zip 2>/dev/null | head -1 || true)"
fi
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
  echo "No GoatCounter export found."
  echo "Download one: $SITE → Settings → Export → Start export, then run ./analytics.sh again"
  echo "(it looks in this folder and in ~/Downloads)."
  exit 1
fi
echo "Using $ZIP"
echo
summarise_export "$ZIP"

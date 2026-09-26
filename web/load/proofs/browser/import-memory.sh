#!/usr/bin/env bash
# #755: samples renderer RSS between import-memory.js's markers; exit 99 when growth >= 1.5x the archive, 1 when nothing was measured.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=${REPO:-$(git rev-parse --show-toplevel)}
if [[ -z ${LOAD_SUPABASE_URL:-} || -z ${LOAD_SUPABASE_ANON_KEY:-} ]]; then
  status=$(cd "$repo" && supabase status -o json) || { echo 'supabase start first' >&2; exit 1; }
  export LOAD_SUPABASE_URL=$(node -e 'console.log(JSON.parse(process.argv[1]).API_URL ?? "")' "$status")
  export LOAD_SUPABASE_ANON_KEY=$(node -e 'console.log(JSON.parse(process.argv[1]).ANON_KEY ?? "")' "$status")
fi
export LOAD_TARGET=${LOAD_TARGET:-local-stack} LOAD_PROFILE=${LOAD_PROFILE:-normal}
[[ -z ${K6_BROWSER_WS_URL:-} ]] || { echo 'import-memory.sh samples a local Chromium under k6; unset K6_BROWSER_WS_URL' >&2; exit 1; }
report="load-results/proof-import-memory${PROOF_VARIANT:+-$PROOF_VARIANT}.md"
mkdir -p load-results
log=$(mktemp)
samples=$(mktemp)

# Appended, not replaced: a root or container run needs the caller's no-sandbox.
K6_BROWSER_ARGS="${K6_BROWSER_ARGS:+$K6_BROWSER_ARGS,}js-flags=--expose-gc,enable-precise-memory-info" k6 run "$here/import-memory.js" >"$log" 2>&1 &
k6_pid=$!
trap 'kill "$k6_pid" 2>/dev/null || true; rm -f "$log" "$samples"' EXIT

renderer_rss_kib() {
  # Only renderers under this k6 (other browsers and Electron apps have them too); the largest is the app's tab; RSS is in KiB.
  local tree=$k6_pid level=$k6_pid
  while level=$(pgrep -d, -P "$level"); do tree+=",$level"; done
  ps -o rss=,args= -p "$tree" | awk '/--type=renderer/ { if ($1 > max) max = $1 } END { print max + 0 }'
}

archive_bytes=''
baseline=''
saw_end=''
while kill -0 "$k6_pid" 2>/dev/null; do
  if [[ -z $baseline ]] && grep -q 'PROOF_IMPORT_START' "$log"; then
    archive_bytes=$(grep -o 'PROOF_IMPORT_START [0-9]*' "$log" | awk '{ print $2 }')
    baseline=$(renderer_rss_kib)
  fi
  if [[ -n $baseline ]]; then
    renderer_rss_kib >>"$samples"
    if grep -q 'PROOF_IMPORT_END' "$log"; then saw_end=1; break; fi
  fi
  sleep 0.1
done
k6_status=0
wait "$k6_pid" || k6_status=$?
cat "$log"

if [[ -z $baseline || $baseline == 0 || -z $saw_end ]]; then
  echo "import-memory: the import did not run to completion, or no renderer was found under k6 (k6 exit $k6_status); nothing was measured." >&2
  exit 1
fi
peak=$(sort -n "$samples" | tail -1)
growth=$(( (peak - baseline) * 1024 ))
ratio=$(awk -v g="$growth" -v a="$archive_bytes" 'BEGIN { printf "%.2f", g / a }')
measurement="renderer RSS baseline ${baseline} KiB, peak ${peak} KiB; growth ${growth} B = ${ratio}x the ${archive_bytes} B archive (k6 exit $k6_status)"
echo "$measurement"
# The verdict goes into the report the PR carries, not only to stdout.
verdict() { printf '\n**Verdict (import-memory.sh):** %s: %s\n' "$1" "$measurement" | tee -a "$report"; }
if awk -v r="$ratio" 'BEGIN { exit !(r < 1.5) }'; then
  verdict 'PASS, peak growth below 1.5x the archive'
  # A failed check inside k6 (e.g. a short archive) makes the measurement suspect, not the defect.
  exit $(( k6_status ? 1 : 0 ))
fi
verdict 'FAIL, peak growth at or above 1.5x the archive (#755)'
exit 99

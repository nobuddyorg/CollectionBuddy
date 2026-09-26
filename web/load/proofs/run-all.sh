#!/usr/bin/env bash
# Runs the k6 proofs against the local stack; BROWSER=1 adds the browser proofs (start browser/serve-demo.sh first). Reports land in load-results/.
set -uo pipefail
[[ -z ${PROOF_VARIANT:-} ]] || { echo 'run-all.sh names its own reports: copy load-results/ aside between the before and after runs instead' >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
repo=${REPO:-$(git rev-parse --show-toplevel)}
status=$(cd "$repo" && supabase status -o json) || { echo 'supabase start first' >&2; exit 1; }
url=$(node -e 'console.log(JSON.parse(process.argv[1]).API_URL ?? "")' "$status")
key=$(node -e 'console.log(JSON.parse(process.argv[1]).ANON_KEY ?? "")' "$status")
[[ $url == http* && -n $key && $key != undefined ]] || { echo 'cannot read API_URL/ANON_KEY from supabase status' >&2; exit 1; }
export LOAD_SUPABASE_URL=$url LOAD_SUPABASE_ANON_KEY=$key LOAD_TARGET=local-stack LOAD_PROFILE=${LOAD_PROFILE:-normal} K6_WEB_DASHBOARD=false
mkdir -p load-results

red=()
green=()
broken=()
recorded=()
skipped=()

# missing <command...>: the proofs land issue by issue, so a script not in the tree yet is skipped, not counted as broken.
missing() {
  local arg
  for arg; do
    if [[ $arg == "$here"/* && ! -e $arg ]]; then return 0; fi
  done
  return 1
}
# run <report name> <command...>: k6 exits 99 when a threshold fails; any other failure, or an INCONCLUSIVE report, is a broken run, never a red proof.
run() {
  local report=$1
  shift
  if missing "$@"; then skipped+=("$*"); return; fi
  echo "=== $*"
  "$@"
  local rc=$?
  if [[ -f load-results/proof-$report.md ]] && grep -q 'INCONCLUSIVE' "load-results/proof-$report.md"; then
    broken+=("$* (inconclusive report)")
  elif (( rc == 99 )); then
    red+=("$*")
  elif (( rc == 0 )); then
    green+=("$*")
  else
    broken+=("$* (exit $rc)")
  fi
}

# record <report name> <command...>: a run with no verdict (a control, an impact measurement); it only has to finish cleanly.
record() {
  local report=$1
  shift
  if missing "$@"; then skipped+=("$*"); return; fi
  echo "=== $*"
  "$@"
  local rc=$?
  if (( rc == 0 )) && ! grep -qs 'INCONCLUSIVE' "load-results/proof-$report.md"; then
    recorded+=("$*")
  else
    broken+=("$* (exit $rc)")
  fi
}

rm -f load-results/proof-*.md
# #779 first, on the freshly reset stack: other proofs' deleted rows would add dead tuples to its GIN scans. The control expects no gap.
record short-search-control env PROOF_VARIANT=control PROOF_OTHER_ENTRIES=0 k6 run "$here/short-search.js"
run short-search k6 run "$here/short-search.js"
for proof in deep-offset map-places-cap sign-many quota-refused-import round-trips gate-blind-spots; do
  run "$proof" k6 run "$here/$proof.js"
done
# #738's cost, for the record; the red/green proof is browser/safari-webp.js.
record png-vs-webp k6 run "$here/png-vs-webp.js"

if [[ ${BROWSER:-0} == 1 ]]; then
  for proof in safari-webp worker-csp photon-geocoding frontend-loading; do
    run "$proof" k6 run "$here/browser/$proof.js"
  done
  run import-memory "$here/browser/import-memory.sh"
  # Builds and serves its own two builds, on a port serve-demo.sh does not hold.
  run sw-deploy env PORT=4174 "$here/browser/sw-deploy.sh"
fi

echo "red (the defect showing): ${#red[@]}"
if (( ${#red[@]} )); then printf ' - %s\n' "${red[@]}"; fi
echo "green (fixed): ${#green[@]}"
if (( ${#green[@]} )); then printf ' - %s\n' "${green[@]}"; fi
echo "recorded (no verdict): ${#recorded[@]}"
if (( ${#recorded[@]} )); then printf ' - %s\n' "${recorded[@]}"; fi
echo "skipped (not in the tree yet): ${#skipped[@]}"
if (( ${#skipped[@]} )); then printf ' - %s\n' "${skipped[@]}"; fi
echo "broken or inconclusive (fix the run, not the app): ${#broken[@]}"
if (( ${#broken[@]} )); then printf ' - %s\n' "${broken[@]}"; fi
if (( ${#broken[@]} )); then exit 1; fi
if (( ${#red[@]} )); then exit 99; fi
exit 0

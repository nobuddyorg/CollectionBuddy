#!/usr/bin/env bash
# #742: builds A (working tree) and B (plus one ItemForm attribute), serves A as Pages does, runs sw-deploy.js, swaps to B on PROOF_PHASE1_DONE.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=${REPO:-$(git rev-parse --show-toplevel)}
port=${PORT:-4174}
work=$(mktemp -d)
trap 'kill "${k6_pid:-}" "${serve_pid:-}" 2>/dev/null || true; rm -rf "$work"' EXIT
source "$here/lib/build.sh"

read_stack
build_export "$work/a"
build_export "$work/b" 's/data-testid="item-title"/data-testid="item-title" data-proof-build="b"/'

mkdir -p "$work/serve"
ln -sfn "$work/a/web/out" "$work/serve/CollectionBuddy"
start_server "$work/serve" "$port"

log="$work/k6.log"
LOAD_SUPABASE_URL="$api_url" LOAD_SUPABASE_ANON_KEY="$anon_key" LOAD_TARGET=local-stack LOAD_PROFILE=${LOAD_PROFILE:-normal} \
  PROOF_APP_URL="http://localhost:$port/CollectionBuddy/" k6 run "$here/sw-deploy.js" >"$log" 2>&1 &
k6_pid=$!
until grep -q 'PROOF_PHASE1_DONE' "$log" || ! kill -0 "$k6_pid" 2>/dev/null; do sleep 1; done
# The deploy: Pages now serves B, and A's chunk files are gone.
ln -sfn "$work/b/web/out" "$work/serve/CollectionBuddy"
result=0
wait "$k6_pid" || result=$?
k6_pid=''
cat "$log"
exit "$result"

#!/usr/bin/env bash
# Builds the working tree as a demo-mode static export against the local stack and serves it under /CollectionBuddy/ until interrupted.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=${REPO:-$(git rev-parse --show-toplevel)}
port=${PORT:-4173}
work=$(mktemp -d)
trap 'kill "${serve_pid:-}" 2>/dev/null || true; rm -rf "$work"' EXIT
source "$here/lib/build.sh"

read_stack
build_export "$work"
mkdir -p "$work/serve"
ln -s "$work/web/out" "$work/serve/CollectionBuddy"
start_server "$work/serve" "$port"
echo "serving http://localhost:$port/CollectionBuddy/ (Ctrl-C to stop)"
wait "$serve_pid"

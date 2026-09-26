# Sourced by serve-demo.sh and sw-deploy.sh: demo-mode exports of the working tree, built outside the repo (only read), and their server.

# Sets api_url and anon_key from the running local stack.
read_stack() {
  local status
  status=$(cd "$repo" && supabase status -o json) || { echo 'supabase start first' >&2; return 1; }
  api_url=$(node -e 'console.log(JSON.parse(process.argv[1]).API_URL ?? "")' "$status")
  anon_key=$(node -e 'console.log(JSON.parse(process.argv[1]).ANON_KEY ?? "")' "$status")
  [[ $api_url == http* && -n $anon_key ]] || { echo 'cannot read API_URL/ANON_KEY from supabase status' >&2; return 1; }
}

# build_export <dir> [sed expression for components/ItemForm/index.tsx]: the working tree (uncommitted fixes included) into <dir>/web/out.
build_export() {
  local dir=$1
  mkdir -p "$dir"
  # -C before -T: GNU tar applies it only to the names that follow.
  git -C "$repo" ls-files -z -co --exclude-standard web | tar --null --ignore-failed-read -C "$repo" -T - -cf - | tar -x -C "$dir"
  # A copy, not a symlink: Turbopack resolves nothing outside the project root.
  cp -a "$repo/web/node_modules" "$dir/web/"
  if [[ -n ${2:-} ]]; then sed -i "$2" "$dir/web/src/app/components/ItemForm/index.tsx"; fi
  (cd "$dir/web" && NEXT_PUBLIC_SUPABASE_URL="$api_url" NEXT_PUBLIC_SUPABASE_ANON_KEY="$anon_key" \
    NEXT_PUBLIC_DEMO_MODE=true NEXT_TELEMETRY_DISABLED=1 npx next build >/dev/null)
}

# start_server <root> <port>: serves <root> in the background (serve_pid is the server itself) and waits until the app answers.
start_server() {
  if curl -s -o /dev/null "http://localhost:$2/"; then echo "port $2 is already in use" >&2; return 1; fi
  "$repo/web/node_modules/.bin/serve" "$1" -l "$2" >/dev/null 2>&1 &
  serve_pid=$!
  for _ in $(seq 60); do
    curl -sf -o /dev/null "http://localhost:$2/CollectionBuddy/" && return 0
    sleep 1
  done
  echo "the server on port $2 never answered" >&2
  return 1
}

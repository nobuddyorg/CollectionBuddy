# Sourced by the proof scripts: read_stack sets api_url, anon_key and db_url from the local stack at $repo.
read_stack() {
  local status
  status=$(cd "$repo" && supabase status -o json) || { echo 'supabase start first' >&2; return 1; }
  api_url=$(node -e 'console.log(JSON.parse(process.argv[1]).API_URL ?? "")' "$status")
  anon_key=$(node -e 'console.log(JSON.parse(process.argv[1]).ANON_KEY ?? "")' "$status")
  db_url=$(node -e 'console.log(JSON.parse(process.argv[1]).DB_URL ?? "")' "$status")
  [[ $api_url == http* && -n $anon_key && $anon_key != undefined ]] || { echo 'cannot read API_URL/ANON_KEY from supabase status' >&2; return 1; }
}

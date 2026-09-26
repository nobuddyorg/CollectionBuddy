#!/usr/bin/env bash
# Fails when the commits since <base> edit, rename or delete a migration, or add one that `supabase db push` would skip or refuse.
set -euo pipefail

base=$(git merge-base "${1:?usage: supabase/check-migration-history.sh <base commit or ref>}" HEAD)
dir=supabase/migrations

# Captured first: `git log | grep -q` under pipefail reads as no match once grep closes the pipe early.
messages=$(git log --format=%B "$base..HEAD")
if grep -Eiq '^Rewrites-migrations: *[^[:space:]]' <<<"$messages"; then
  echo "A commit carries a Rewrites-migrations trailer; the migration history is not checked."
  exit 0
fi

last=$(git ls-tree --name-only "$base" "$dir/" | sed -En 's|^.*/([0-9]+)_[^/]*\.sql$|\1|p' | sort | tail -n 1)
failed=0
while IFS=$'\t' read -r status path; do
  name=${path##*/}
  version=${name%%_*}
  if [ "$status" != A ]; then
    echo "::error file=$path::$path existed at the base, so production may have applied it: never edit, rename or delete it; add a new migration (docs/how-to/developer-guide.md#roll-back-a-bad-deploy)."
    failed=1
  elif [[ ! "$name" =~ ^[0-9]+_.+\.sql$ ]]; then
    echo "::error file=$path::$path does not match NNNN_description.sql, so the Supabase CLI would never apply it."
    failed=1
  elif [[ ! "$version" > "$last" ]]; then
    echo "::error file=$path::$path is not numbered after $last, the last migration at the base, so db push would refuse it: renumber it."
    failed=1
  fi
done < <(git diff --no-renames --name-status "$base" HEAD -- "$dir/")

[ "$failed" = 0 ] && echo "Migration history only grows since $base."
exit "$failed"

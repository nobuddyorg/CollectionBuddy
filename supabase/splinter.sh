#!/usr/bin/env bash
# Supabase's Advisors lints (Splinter) against the local stack; exits 1 on any WARN/ERROR not excused below.
set -euo pipefail

SPLINTER_COMMIT=e74a9e36cb12258cb67d1464bc1cb196e9cd8446 # tag 2026.09.1
SPLINTER_SHA256=d8d558baad3e03832e521c527907fa50a9a172fabd899dd0f5c2504a5a0e9349
DB_URL=${SUPABASE_LOCAL_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}

# One lint name or cache_key per line, each with its reason.
EXCUSED=$(
  cat <<'EOF'
unused_index
authenticated_security_definer_function_executable_public_search_category_items_cat_id uuid, like_pattern text, page_from integer, page_to integer
authenticated_security_definer_function_executable_public_photo_upload_has_room_
EOF
)
# unused_index: reads runtime statistics, which a freshly reset database does not have.
# search_category_items: SECURITY DEFINER on purpose, so the trigram indexes stay reachable under RLS (design-decisions.md).
# photo_upload_has_room: SECURITY DEFINER on purpose, the upload policy's count of the whole bucket; it answers only yes or no.

lints=$(mktemp)
trap 'rm -f "$lints"' EXIT
curl -fsSL "https://raw.githubusercontent.com/supabase/splinter/$SPLINTER_COMMIT/splinter.sql" -o "$lints"
echo "$SPLINTER_SHA256  $lints" | sha256sum --check --quiet

# \x1f/\x1e delimiters: lint descriptions carry commas, quotes and newlines, never control characters.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 --single-transaction \
  --no-align --tuples-only --field-separator=$'\x1f' --record-separator=$'\x1e' \
  -f "$lints" |
  EXCUSED="$EXCUSED" awk '
    BEGIN {
      RS = "\x1e"; FS = "\x1f"; failed = 0
      split(ENVIRON["EXCUSED"], lines, "\n")
      for (i in lines) excused[lines[i]] = 1
    }
    { sub(/\n+$/, "") }
    NF < 10 { if (length($0)) unparsed = 1; next }
    { rows++ }
    $1 in excused || $10 in excused { skipped++; next }
    {
      print $3 "  " $1 ": " $7
      if ($3 == "WARN" || $3 == "ERROR") failed = 1
    }
    END {
      print "Splinter: " rows + 0 " rows, " skipped + 0 " excused"
      if (unparsed) { print "Splinter: output not in the expected 10-column shape"; exit 1 }
      exit failed
    }
  '

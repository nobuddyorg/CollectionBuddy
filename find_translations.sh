#!/bin/bash

# Ensure jq is installed
if ! command -v jq &> /dev/null
then
    echo "jq could not be found, installing..."
    sudo apt-get update && sudo apt-get install -y jq
fi

# Function to extract keys from a JSON file and flatten them
extract_keys() {
    jq -r '
    def flatten($base; $value):
      if ($value | type) == "object" then
        ($value | keys_unsorted[]) as $key |
        flatten("\($base).\($key)"; $value[$key])
      else
        $base
      end;

    (keys_unsorted[]) as $key |
    flatten($key; .[$key])
    ' "$1"
}

# Files
EN_FILE="web/src/app/locales/en.json"
DE_FILE="web/src/app/locales/de.json"
SOURCE_DIR="web/src"

# Extract keys
en_keys=$(extract_keys "$EN_FILE")
de_keys=$(extract_keys "$DE_FILE")

# Find missing keys
echo "--- Missing keys in de.json ---"
comm -23 <(echo "$en_keys" | sort) <(echo "$de_keys" | sort)

echo ""
echo "--- Missing keys in en.json ---"
comm -13 <(echo "$en_keys" | sort) <(echo "$de_keys" | sort)

# Find unused keys
echo ""
echo "--- Unused keys ---"
all_keys=$(echo "$en_keys" "$de_keys" | tr ' ' '\n' | sort -u)

for key in $all_keys; do
    # Search for the key in the source directory
    if ! grep -rq "$key" "$SOURCE_DIR"; then
        echo "$key"
    fi
done

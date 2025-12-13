#!/bin/bash
#only local sanity check

set -euo pipefail

pushd web >/dev/null
rm -rf out
npm ci
npm run format
npm run build
touch out/.nojekyll
popd >/dev/null

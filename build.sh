#!/bin/bash

pushd web
rm -rf out
rm -rf ../docs
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="dummy_anon_key"
npm ci
npm run build
touch out/.nojekyll
cp -a out/. ../docs
popd

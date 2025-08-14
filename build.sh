#!/bin/bash

pushd web
rm -rf out
rm -rf ../docs
npm ci
npm run format
npm run build
touch out/.nojekyll
cp -a out/. ../docs
popd

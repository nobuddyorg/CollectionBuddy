#!/usr/bin/env bash
# Puts the background removal model where the app serves it: public/models/ (docs/how-to/developer-guide.md#the-background-removal-model).
# ISNet (DIS, Apache-2.0), as rembg exports it to ONNX, converted to float16: half the download, the same mask.
set -euo pipefail

cd "$(dirname "$0")"
SOURCE_URL=https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx
SOURCE_SHA256=60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a
MODEL_SHA256=1e00f2f0b23dea1b687ff90652263144fdb98af942aaa0cae8630c49159b18f0
# Renamed with the model: the file name is what retires the copy browsers cached (src/app/lib/backgroundRemoval.ts).
TARGET=../../public/models/isnet-general-use-fp16.onnx

if [ -f "$TARGET" ] && echo "$MODEL_SHA256  $TARGET" | sha256sum --check --status; then
  echo "The segmentation model is already in place."
  exit 0
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

curl --fail --location --silent --show-error --retry 3 --output "$work/source.onnx" "$SOURCE_URL"
echo "$SOURCE_SHA256  $work/source.onnx" | sha256sum --check --quiet

python3 -m venv "$work/venv"
"$work/venv/bin/pip" install --quiet --disable-pip-version-check --only-binary :all: --require-hashes --requirement requirements.txt
"$work/venv/bin/python" to_fp16.py "$work/source.onnx" "$work/model.onnx" 2>/dev/null
echo "$MODEL_SHA256  $work/model.onnx" | sha256sum --check --quiet

mkdir -p "$(dirname "$TARGET")"
mv "$work/model.onnx" "$TARGET"
echo "The segmentation model is in place: $(du -h "$TARGET" | cut -f1)."

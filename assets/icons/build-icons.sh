#!/usr/bin/env bash

# Build appIcon.ico and appIcon.icns from PNGs in assets/icons/png/
# Requires: ImageMagick (magick/convert) and macOS iconutil

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PNG_DIR="$ROOT/png"
ICO_OUT="$ROOT/appIcon.ico"
ICNS_OUT="$ROOT/appIcon.icns"
ICONSET="$ROOT/icon.iconset"

ICO_SIZES=(16 32 48 64 128 256 512)
ICNS_SIZES=(16 32 64 128 256 512 1024)

err() { echo "❌ $*" >&2; exit 1; }
info() { echo "• $*"; }
resize_into() { # $1=src $2=size $3=dest
  "${MAGICK[@]}" "$1" -resize "${2}x${2}" "$3"
}
resize_padded() { # $1=src $2=size $3=dest
  local pad_size=$(($2 * 80 / 100))
  "${MAGICK[@]}" "$1" -resize "${pad_size}x${pad_size}" -background none -gravity center -extent "${2}x${2}" "$3"
}
KEEP_ICONSET="${KEEP_ICONSET:-0}"

# Choose ImageMagick binary
if command -v magick >/dev/null 2>&1; then
  MAGICK=(magick)
elif command -v convert >/dev/null 2>&1; then
  MAGICK=(convert)
else
  err "ImageMagick not found (need 'magick' or 'convert'). Install it first."
fi

command -v iconutil >/dev/null 2>&1 || err "iconutil not found (macOS-only). Install Xcode command line tools: xcode-select --install"

[ -d "$PNG_DIR" ] || err "PNG directory missing: $PNG_DIR"

require_sizes() {
  local missing=()
  for size in "$@"; do
    local file="$PNG_DIR/$size.png"
    [ -f "$file" ] || missing+=("$file")
  done
  if [ "${#missing[@]}" -ne 0 ]; then
    err "Missing PNG(s): ${missing[*]}"
  fi
}

require_sizes "${ICO_SIZES[@]}"
require_sizes "${ICNS_SIZES[@]}"

ICO_TMP="$(mktemp -d "$ROOT/.ico-src.XXXXXX")"
trap 'rm -rf "$ICO_TMP"' EXIT

info "Normalizing PNGs for ICO → $ICO_TMP"
for size in "${ICO_SIZES[@]}"; do
  resize_into "$PNG_DIR/${size}.png" "$size" "$ICO_TMP/${size}.png"
done

# info "Building ICO → $ICO_OUT"
# "${MAGICK[@]}" \
#   "$ICO_TMP/16.png" \
#   "$ICO_TMP/32.png" \
#   "$ICO_TMP/48.png" \
#   "$ICO_TMP/64.png" \
#   "$ICO_TMP/128.png" \
#   "$ICO_TMP/256.png" \
#   "$ICO_TMP/512.png" \
#   "$ICO_OUT"

info "Preparing iconset at $ICONSET"
rm -rf "$ICONSET"
mkdir -p "$ICONSET"

resize_padded "$PNG_DIR/16.png"   16   "$ICONSET/icon_16x16.png"
resize_padded "$PNG_DIR/32.png"   32   "$ICONSET/icon_16x16@2x.png"
resize_padded "$PNG_DIR/32.png"   32   "$ICONSET/icon_32x32.png"
resize_padded "$PNG_DIR/64.png"   64   "$ICONSET/icon_32x32@2x.png"
resize_padded "$PNG_DIR/128.png"  128  "$ICONSET/icon_128x128.png"
resize_padded "$PNG_DIR/256.png"  256  "$ICONSET/icon_128x128@2x.png"
resize_padded "$PNG_DIR/256.png"  256  "$ICONSET/icon_256x256.png"
resize_padded "$PNG_DIR/512.png"  512  "$ICONSET/icon_256x256@2x.png"
resize_padded "$PNG_DIR/512.png"  512  "$ICONSET/icon_512x512.png"
resize_padded "$PNG_DIR/1024.png" 1024 "$ICONSET/icon_512x512@2x.png"

info "Building ICNS → $ICNS_OUT"
if ! iconutil -c icns "$ICONSET" -o "$ICNS_OUT"; then
  err "iconutil failed (install Xcode command line tools: xcode-select --install). iconset left at $ICONSET for manual conversion."
fi

if [ "$KEEP_ICONSET" = "1" ]; then
  info "KEEP_ICONSET=1 → leaving iconset at $ICONSET"
else
  rm -rf "$ICONSET"
fi

info "Done. Run 'node scripts/copy-icons.js' to sync into resources/icons/."

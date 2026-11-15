#!/usr/bin/env bash
# Fetch the OFL fonts from Google Fonts and subset them to the glyphs this page uses.
# Run once (and again only if the copy or the type changes): npm run fonts
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/assets/fonts
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
GIANT='maintenance'
LEAD='kawanjapan.com is currently under'
JA='ただいまメンテナンス中'

latin() { # $1 css url, $2 out path (the last url() in the css is the latin subset)
  local url
  url=$(curl -sf -H "User-Agent: $UA" "$1" | grep -o 'url(https://fonts.gstatic.com[^)]*)' | tail -1 | sed 's/^url(//; s/)$//')
  [ -n "$url" ] || { echo "no woff2 in $1" >&2; exit 1; }
  curl -sf "$url" -o "$2"
}

# Subsetting needs fonttools + brotli; a local venv keeps it out of the system python.
# python3 -m venv .venv && .venv/bin/pip install fonttools brotli
PYS=$( [ -x .venv/bin/pyftsubset ] && echo .venv/bin/pyftsubset || echo pyftsubset )

subset() { # $1 in, $2 text, $3 out
  "$PYS" "$1" --text="$2" --flavor=woff2 --layout-features='*' --no-hinting --output-file="$3"
}

enc() { python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1]))' "$1"; }

# Two static Bodoni instances: canvas text metrics must match the DOM, so no variation settings.
latin 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@96,500' "$TMP/bd.woff2"
subset "$TMP/bd.woff2" "$GIANT" "$OUT/bodoni-display.woff2"
latin 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@28,400' "$TMP/bt.woff2"
subset "$TMP/bt.woff2" "$LEAD" "$OUT/bodoni-text.woff2"

# Archivo carries body copy, form states and labels: printable ASCII plus the punctuation used.
ASCII=$(python3 -c "print(''.join(chr(c) for c in range(32, 127)) + '’‘“”–—…')")
latin 'https://fonts.googleapis.com/css2?family=Archivo:wght@400..500' "$TMP/ar.woff2"
subset "$TMP/ar.woff2" "$ASCII" "$OUT/archivo.woff2"

# Shippori Mincho full CJK is several MB; Google's text= parameter returns just these glyphs.
latin "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500&text=$(enc "$JA")" "$OUT/shippori-mincho.woff2"

du -b "$OUT"/*.woff2

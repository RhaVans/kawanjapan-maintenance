#!/usr/bin/env bash
# Fetch the OFL fonts from Google Fonts and subset them to this page's glyphs.
# Run once (and again only if the copy or the type changes): npm run fonts
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/assets/fonts
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

# One source of truth for the copy: src/copy.json.
eval "$(node scripts/glyphs.mjs)"
echo "glyphs: display=${#DISPLAY} lead=${#LEAD} ja=${#JA} latin=${#LATIN}"

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

# Bodoni's hairline thins as opsz rises; at 76 CSS px an opsz 96 cut falls below
# one device pixel on a DPR 1 screen. Clamp the axis low so the thinnest stroke
# stays over 1.5 device px, and confirm with the crops in the report.
latin 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6,600' "$TMP/bd.woff2"
subset "$TMP/bd.woff2" "$DISPLAY" "$OUT/bodoni-display.woff2"
latin 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6,400' "$TMP/bt.woff2"
subset "$TMP/bt.woff2" "$LEAD" "$OUT/bodoni-text.woff2"

# Archivo carries body copy, states and labels. Four unicode-range slices keep each
# file small; the ranges must match the unicode-range values in index.html.
CAPS=ABCDEFGHIJKLMNOPQRSTUVWXYZ
LOWER=abcdefghijklmnopqrstuvwxyz
DIGITS=0123456789
PUNCT=$(cat <<'EOT'
.,:;/-+@'"()?!&%…–—‘’“”·
EOT
)
latin 'https://fonts.googleapis.com/css2?family=Archivo:wght@400..500' "$TMP/ar.woff2"
subset "$TMP/ar.woff2" "$CAPS"   "$OUT/archivo-caps.woff2"
subset "$TMP/ar.woff2" "$LOWER"  "$OUT/archivo-lower.woff2"
subset "$TMP/ar.woff2" "$DIGITS" "$OUT/archivo-digits.woff2"
subset "$TMP/ar.woff2" "$PUNCT"  "$OUT/archivo-punct.woff2"

# Front-weight CJK. Google's text= parameter returns just the glyphs used here.
latin "https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500&text=$(enc "$JA")" "$OUT/shippori-mincho.woff2"

du -b "$OUT"/*.woff2

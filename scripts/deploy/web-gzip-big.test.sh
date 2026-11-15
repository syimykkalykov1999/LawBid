#!/usr/bin/env bash
# Row 170 (14.11): web-gzip-big.sh uploads NOTICES, AssetManifest.bin and the
# shaders gzip-compressed (CloudFront never compresses them), with a stub aws.
#   bash scripts/deploy/web-gzip-big.test.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fail=1; }

mkdir -p "$T/bin" "$T/w/v/abc1234/assets/shaders" "$T/w/v/abc1234/canvaskit"
cat >"$T/bin/aws" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$AWS_LOG"
STUB
chmod +x "$T/bin/aws"
head -c 4000 /dev/zero | tr '\0' 'a' >"$T/w/v/abc1234/assets/NOTICES"
head -c 4000 /dev/zero >"$T/w/v/abc1234/assets/AssetManifest.bin"
head -c 4000 /dev/zero >"$T/w/v/abc1234/assets/shaders/ink_sparkle.frag"
head -c 100 /dev/zero >"$T/w/v/abc1234/assets/shaders/tiny.frag"
head -c 4000 /dev/zero >"$T/w/v/abc1234/canvaskit/skwasm.wasm"
export AWS_LOG="$T/aws.log"
: >"$AWS_LOG"
(cd "$T/w" && PATH="$T/bin:$PATH" bash "$D/web-gzip-big.sh" s3://b/releases/x "CC" "IMM" >/dev/null)

line() { grep -F -- "$1" "$AWS_LOG" || true; }
l=$(line "s3://b/releases/x/v/abc1234/assets/NOTICES ")
case "$l" in *"--content-encoding gzip"*"--content-type text/plain; charset=utf-8"*"--cache-control IMM"*) ok "NOTICES gzip, text/plain, immutable" ;; *) bad "NOTICES: '$l'" ;; esac
l=$(line "s3://b/releases/x/v/abc1234/assets/AssetManifest.bin ")
case "$l" in *"--content-encoding gzip"*"--content-type application/octet-stream"*) ok "AssetManifest.bin gzip" ;; *) bad "AssetManifest.bin: '$l'" ;; esac
l=$(line "s3://b/releases/x/v/abc1234/assets/shaders/ink_sparkle.frag ")
case "$l" in *"--content-encoding gzip"*"--content-type application/octet-stream"*) ok "ink_sparkle.frag gzip" ;; *) bad "ink_sparkle.frag: '$l'" ;; esac
[ -z "$(line tiny.frag)" ] && ok "a file under 1000 B is left alone" || bad "tiny.frag was uploaded"
if command -v brotli >/dev/null 2>&1; then
  l=$(line "s3://b/releases/x/v/abc1234/canvaskit/skwasm.wasm.br")
  case "$l" in *"--content-encoding br"*"application/wasm"*) ok "engine brotli twin" ;; *) bad "engine brotli twin: '$l'" ;; esac
fi
[ "$fail" = 0 ] && echo "web-gzip-big: all checks passed" || { echo "web-gzip-big: some checks FAILED"; exit 1; }

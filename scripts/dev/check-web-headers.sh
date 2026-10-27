#!/usr/bin/env bash
# Checks the web module's caching / compression / isolation headers.
#
#   scripts/dev/check-web-headers.sh                 # static checks + terraform validate
#   scripts/dev/check-web-headers.sh --live https://lawbid.dev
#                                                    # also asks the live site
#
# Static (no AWS access needed):
#   - terraform fmt + validate of infra/modules/web (init without a backend;
#     the provider comes from ~/.terraform.d/plugin-cache when it is there)
#   - every cache behavior compresses (gzip + brotli via CachingOptimized)
#   - COOP/COEP are behind the `cross_origin_isolation` switch, only on the
#     app's policy, with COEP `credentialless`, and the card page has its
#     own behavior without them
#   - the brotli function patterns and web-gzip-big.sh twin the same files
#   - the deploy writes a year + immutable on v/<sha>/ and must-revalidate
#     on the page-level files
# Live (--live URL): main.dart.wasm, main.dart.mjs, canvaskit, a font —
#   Content-Encoding br/gzip and Cache-Control immutable; the page's
#   COOP/COEP (reported, not required: the switch is off by default).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TF="$ROOT/infra/modules/web/main.tf"
DEPLOY="$ROOT/.github/workflows/web-deploy.yml"
GZ="$ROOT/scripts/deploy/web-gzip-big.sh"
fail=0
ok() { echo "ok   $*"; }
bad() { echo "FAIL $*"; fail=1; }
has() { grep -qE -- "$2" "$1"; }

# --- terraform ---------------------------------------------------------------
if command -v terraform >/dev/null 2>&1; then
  terraform fmt -check "$ROOT/infra/modules/web" >/dev/null && ok "terraform fmt" || bad "terraform fmt (run terraform fmt infra/modules/web)"
  WORK=$(mktemp -d)
  trap 'rm -rf "$WORK"' EXIT
  cp "$TF" "$WORK/"
  CACHE="${TF_PLUGIN_CACHE_DIR:-$HOME/.terraform.d/plugin-cache}"
  # A cached provider: no registry round trip (slow links hang here).
  if [ -d "$CACHE/registry.terraform.io/hashicorp/aws" ]; then
    # (the CLI config's own plugin_cache_dir must be off, or terraform
    # refuses to "install the cache into itself")
    INIT=(env TF_CLI_CONFIG_FILE=/dev/null terraform init -backend=false -input=false -plugin-dir="$CACHE")
  else
    INIT=(terraform init -backend=false -input=false)
  fi
  if (cd "$WORK" && "${INIT[@]}" >/dev/null 2>&1); then
    if out=$(cd "$WORK" && terraform validate -no-color 2>&1); then ok "terraform validate"; else bad "terraform validate"; echo "$out"; fi
  else
    echo "skip terraform validate (provider download failed: offline?)"
  fi
else
  echo "skip terraform (not installed)"
fi

# --- compression ---------------------------------------------------------------
n_beh=$(grep -cE '^\s*(default_cache_behavior|content) \{' "$TF" || true)
n_cmp=$(grep -cE '^\s*compress\s*=\s*true' "$TF" || true)
n_off=$(grep -cE '^\s*compress\s*=\s*false' "$TF" || true)
[ "$n_off" = 0 ] && [ "$n_cmp" -ge 3 ] && ok "compress = true on every behavior ($n_cmp)" || bad "a cache behavior does not compress ($n_cmp true, $n_off false)"
has "$TF" '658327ea-f89d-4fab-a63d-7e88639e58f6' && ok "CachingOptimized (gzip + brotli in the cache key)" || bad "managed CachingOptimized policy missing"
has "$GZ" "\*\.ttf\) echo font/ttf" && ok "fonts uploaded with font/ttf (compressible type)" || bad "fonts' content type not set"
twins=1
for p in main.dart.js main.dart.wasm main.dart.mjs 'assets/*.ttf' 'assets/*.otf' 'canvaskit/*.wasm'; do
  grep -qF -- "-path '*/$p'" "$GZ" || { bad "web-gzip-big.sh makes no brotli twin for $p"; twins=0; }
done
[ "$twins" = 1 ] && ok "brotli twins: app, engine, fonts"
has "$TF" "var BR2 = " && has "$TF" "'br2_' \+ rel" && ok "BR2 (fonts, mjs) gated by br2_<sha>" || bad "BR2 pattern / br2_ marker missing"
has "$DEPLOY" 'put "\$ARN" "br2_\$SHA" 1' && ok "deploy marks br2_<sha>" || bad "deploy does not mark br2_<sha>"
has "$ROOT/scripts/deploy/web-prune-releases.sh" 'br2_\$REL' && ok "prune drops br2_<sha>" || bad "prune leaves br2_<sha>"

# --- caching -----------------------------------------------------------------
has "$DEPLOY" 'IMM="public,max-age=31536000,immutable"' && ok "v/<sha>/ immutable for a year" || bad "immutable cache-control missing"
has "$DEPLOY" 'CC="public,max-age=0,must-revalidate' && ok "page-level files revalidate" || bad "page-level cache-control changed"
has "$ROOT/scripts/deploy/web-immutable.py" 'main\.dart' && ok "main.dart.* (wasm, mjs, js) moved under v/<sha>/" || bad "web-immutable.py no longer moves main.dart.*"

# --- cross-origin isolation ----------------------------------------------------
has "$TF" 'var.cross_origin_isolation && each.key == "app"' && ok "COOP/COEP only on the app's policy, behind the switch" || bad "COOP/COEP not limited to the app's policy"
has "$TF" 'value += "credentialless"|value\s*=\s*"credentialless"' && ok "COEP credentialless" || bad "COEP is not credentialless"
has "$TF" 'value\s*=\s*"same-origin"' && ok "COOP same-origin" || bad "COOP same-origin missing"
has "$TF" '"/pay.html"' && ok "card page has its own behavior (no isolation)" || bad "card page would be isolated"

# --- live --------------------------------------------------------------------
if [ "${1:-}" = "--live" ]; then
  URL="${2:?--live needs a URL}"
  page=$(curl -fsS "$URL/" || true)
  v=$(printf '%s' "$page" | grep -oE 'v/[0-9A-Za-z]{7,64}/' | head -1 || true)
  [ -n "$v" ] || v=$(curl -fsS "$URL/boot_head.js" | grep -oE 'v/[0-9A-Za-z]{7,64}/' | head -1 || true)
  [ -n "$v" ] || { bad "live: no v/<sha>/ found in the page"; exit 1; }
  font=$(curl -fsS -H 'Accept-Encoding: br, gzip' --compressed "$URL/${v}assets/FontManifest.json" \
    | grep -oE '"asset":"[^"]+\.(ttf|otf)"' | head -1 | sed -E 's/"asset":"([^"]+)"/\1/' || true)
  for path in main.dart.wasm main.dart.mjs canvaskit/skwasm.wasm ${font:+assets/$font}; do
    h=$(curl -sS -o /dev/null -D - -H 'Accept-Encoding: br, gzip' "$URL/$v$path" | tr -d '\r')
    enc=$(printf '%s' "$h" | awk -F': ' 'tolower($1)=="content-encoding"{print $2}')
    cc=$(printf '%s' "$h" | awk -F': ' 'tolower($1)=="cache-control"{print $2}')
    case "$enc" in br|gzip) ok "live $path: $enc" ;; *) bad "live $path: not compressed (${enc:-none})" ;; esac
    case "$cc" in *immutable*) ok "live $path: $cc" ;; *) bad "live $path: cache-control '$cc'" ;; esac
  done
  h=$(curl -sS -o /dev/null -D - "$URL/" | tr -d '\r')
  coop=$(printf '%s' "$h" | awk -F': ' 'tolower($1)=="cross-origin-opener-policy"{print $2}')
  coep=$(printf '%s' "$h" | awk -F': ' 'tolower($1)=="cross-origin-embedder-policy"{print $2}')
  echo "info live page COOP=${coop:-none} COEP=${coep:-none} (isolated only when both are set)"
fi

[ "$fail" = 0 ] && echo "web headers: all checks passed" || { echo "web headers: some checks FAILED"; exit 1; }

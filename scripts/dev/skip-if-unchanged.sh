#!/usr/bin/env bash
# Runs a generator only when its inputs changed since the last successful run.
#
#   scripts/dev/skip-if-unchanged.sh <key> <input...> -- <output...> -- <command...>
#
#   <input...>   files or folders whose CONTENT decides (hashed)
#   <output...>  files or folders that must still exist, else we re-run
#   FORCE=1      always run
#
# The hash is stored in <repo>/.cache/dev/skip/<key> (gitignored) and written
# only after the command succeeded. CI does not use this script: it keeps
# running the generators and diffing the result.
set -eu

root=$(cd "$(dirname "$0")/../.." && pwd)
key=$1; shift
inputs=(); outputs=()
while [ $# -gt 0 ] && [ "$1" != "--" ]; do inputs+=("$1"); shift; done
shift
while [ $# -gt 0 ] && [ "$1" != "--" ]; do outputs+=("$1"); shift; done
shift
[ $# -gt 0 ] || { echo "usage: skip-if-unchanged.sh <key> <inputs..> -- <outputs..> -- <cmd..>" >&2; exit 2; }

cd "$root"
store="$root/.cache/dev/skip"
mkdir -p "$store"

hash=$(
  for i in "${inputs[@]}"; do
    if [ -d "$i" ]; then find "$i" -type f -not -path '*/node_modules/*' -not -path '*/.dart_tool/*' -not -path '*/dist/*' -not -path '*/.cache/*'; else echo "$i"; fi
  done | LC_ALL=C sort | xargs shasum -a 256 | shasum -a 256 | cut -d' ' -f1
)

missing=0
for o in "${outputs[@]}"; do [ -e "$o" ] || missing=1; done

if [ "${FORCE:-0}" != 1 ] && [ "$missing" = 0 ] && [ "$(cat "$store/$key" 2>/dev/null)" = "$hash" ]; then
  echo "[skip-if-unchanged] $key: inputs unchanged, skipping (FORCE=1 to run anyway)"
  exit 0
fi

"$@"
echo "$hash" > "$store/$key"

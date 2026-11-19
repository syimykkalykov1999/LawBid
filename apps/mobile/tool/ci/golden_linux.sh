#!/usr/bin/env bash
# Linux platform goldens (test/helpers/golden_platform.dart, the alchemist
# per-OS layout): every golden test file, compared exactly against
# goldens/linux/<name>.png. Run from apps/mobile on Linux with the Flutter
# pinned in .fvmrc.
#
#   tool/ci/golden_linux.sh                  # compare (CI job "Golden tests (Linux)")
#   tool/ci/golden_linux.sh --update-goldens # rewrite goldens/linux/ after an
#                                            # approved look change (Linux only)
#
# The macOS PNGs (goldens/<name>.png) are never read or written here.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [ "$(uname -s)" != "Linux" ]; then
  echo "::error::Linux goldens must be rendered on Linux (this host: $(uname -s))"
  exit 1
fi
FILES=$(grep -rlE 'golden_toolkit|matchesGoldenFile|screenMatchesGolden' test --include='*_test.dart' | sort)
test -n "$FILES" || { echo "::error::no golden test files found"; exit 1; }
# shellcheck disable=SC2086 # one argument per file
exec flutter test --dart-define=GOLDEN_PLATFORM=linux --concurrency="${GOLDEN_CONCURRENCY:-4}" "$@" $FILES

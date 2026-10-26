#!/usr/bin/env bash
# Frees disk space on a dev Mac from things that rebuild themselves.
#
#   scripts/dev/clean-caches.sh [--dry-run]
#
# Touches ONLY rebuildable caches and stale build output:
#   - the npm cache, Gradle's transform caches, Docker's build cache and
#     dangling images, unavailable iOS simulators;
#   - build output of this repo and its worktrees (apps/mobile/build,
#     apps/admin/.next).
# Never touches: Docker containers and VOLUMES (your databases), DB backups,
# the Android emulator (AVD), source code, node_modules, git data.
# The next Flutter / Gradle build after this takes a few minutes longer.
set -uo pipefail

DRY=0
[[ "${1:-}" == "--dry-run" ]] && DRY=1

size() { du -sk "$@" 2>/dev/null | awk '{s+=$1} END {printf "%.1f GB", s/1048576}'; }
free() { df -k / | awk 'NR==2 {printf "%.1f GB free", $4/1048576}'; }

echo "Before: $(free)"
[[ $DRY == 1 ]] && echo "(dry run: nothing is deleted)"

run() { # run <label> <command...>
  local label="$1"; shift
  echo "- $label"
  [[ $DRY == 1 ]] || "$@" >/dev/null 2>&1 || true
}

# Package-manager and build caches.
echo "npm cache: $(size ~/.npm)"
run "npm cache clean" npm cache clean --force
GRADLE_CACHES=$(ls -d ~/.gradle/caches/*/transforms ~/.gradle/caches/*/generated-gradle-jars ~/.gradle/caches/build-cache-* 2>/dev/null)
if [[ -n "$GRADLE_CACHES" ]]; then
  echo "Gradle transforms: $(size $GRADLE_CACHES)"
  # Stop Gradle first: it keeps references to what is about to go.
  run "stop Gradle daemons" pkill -f GradleDaemon
  # shellcheck disable=SC2086
  run "remove Gradle transform caches" rm -rf $GRADLE_CACHES
fi
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  run "Docker build cache" docker builder prune -af
  run "Docker dangling images" docker image prune -f
fi
command -v xcrun >/dev/null && run "unavailable iOS simulators" xcrun simctl delete unavailable

# Stale build output of the repo and its worktrees (git root of this script).
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="$(git -C "$ROOT" worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}')"
BUSY="$(lsof -a -c node -c next-server -c dart -c java -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')"
for wt in $MAIN; do
  # A running server (admin, web preview, API) lives off this build output.
  if awk -v w="$wt" '($0 == w || index($0, w "/") == 1) && index($0, w "/.claude/worktrees/") != 1 {f = 1} END {exit !f}' <<<"$BUSY"; then
    echo "skip $wt: something is running there (stop it to clean its build output)"
    continue
  fi
  for d in "$wt/apps/mobile/build" "$wt/apps/admin/.next"; do
    if [[ -d "$d" ]]; then
      echo "build output $d: $(size "$d")"
      run "remove $d" rm -rf "$d"
    fi
  done
done

echo "After:  $(free)"

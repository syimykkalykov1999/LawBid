#!/usr/bin/env bash
# Self-hosted GitHub Actions runners for API CI, on the owner's Linux laptop.
# Runbook: docs/runbooks/self-hosted-runner.md
#
#   scripts/ci/self-hosted-runner.sh up      start N ephemeral runners, set repo variable CI_RUNNER=self
#   scripts/ci/self-hosted-runner.sh down    stop them, set CI_RUNNER back to github (jobs use ubuntu-latest)
#   scripts/ci/self-hosted-runner.sh status
#
# Safety model: every runner is its own container, ephemeral (one job, then it is
# destroyed and recreated with a fresh registration token), no bind mounts, no
# home directory, CPU/RAM limited. Docker for the job's service containers is a
# private Docker-in-Docker sidecar per runner (privileged sidecar, NOT the host
# socket). The registration token is requested with `gh` at start and never
# stored. Workflows send only same-repo PRs and pushes here (see api-ci.yml).
# Needs: docker, gh (logged in as a repo admin). Nothing else is installed.
set -euo pipefail

REPO="${REPO:-syimykkalykov1999/LawBid}"
COUNT="${RUNNERS:-4}"          # parallel runners
CPUS="${RUNNER_CPUS:-6}"       # per runner
MEM="${RUNNER_MEM:-12g}"       # per runner
LABELS="lawbid-ci"
IMG="lawbid-ci-runner:local"
NET="lawbid-ci-net"
cmd="${1:-status}"

build_image() {
  docker image inspect "$IMG" >/dev/null 2>&1 && return
  d=$(mktemp -d)
  cat >"$d/Dockerfile" <<'D'
FROM ghcr.io/actions/actions-runner:latest
USER root
RUN apt-get update && apt-get install -y --no-install-recommends docker.io curl ca-certificates && rm -rf /var/lib/apt/lists/*
USER runner
D
  docker build -q -t "$IMG" "$d" >/dev/null
  rm -rf "$d"
}

# One supervisor loop per runner: register (fresh token) -> run one job -> exit -> restart.
start_one() {
  i="$1"
  docker rm -f "lawbid-ci-dind-$i" "lawbid-ci-run-$i" >/dev/null 2>&1 || true
  docker run -d --name "lawbid-ci-dind-$i" --privileged --network "$NET" --restart unless-stopped \
    -e DOCKER_TLS_CERTDIR= docker:27-dind >/dev/null
  (
    while [ -f "/tmp/lawbid-ci-up" ]; do
      tok=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token)
      docker run --rm --name "lawbid-ci-run-$i" --network "$NET" --cpus "$CPUS" --memory "$MEM" \
        -e DOCKER_HOST="tcp://lawbid-ci-dind-$i:2375" -e RTOK="$tok" -e REPO="$REPO" -e LABELS="$LABELS" -e N="$i" \
        "$IMG" bash -c './config.sh --unattended --ephemeral --url "https://github.com/$REPO" --token "$RTOK" --labels "$LABELS" --name "laptop-$N-$(hostname)" && ./run.sh' || sleep 10
    done
  ) >/dev/null 2>&1 &
}

case "$cmd" in
  up)
    build_image
    docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
    touch /tmp/lawbid-ci-up
    for i in $(seq 1 "$COUNT"); do start_one "$i"; done
    sleep 20
    gh variable set CI_RUNNER --repo "$REPO" --body self
    echo "up: $COUNT runners, CI_RUNNER=self"
    ;;
  down)
    gh variable set CI_RUNNER --repo "$REPO" --body github
    rm -f /tmp/lawbid-ci-up
    docker ps -aq --filter name=lawbid-ci- | xargs -r docker rm -f >/dev/null
    echo "down: CI_RUNNER=github, jobs use ubuntu-latest"
    ;;
  status)
    echo "CI_RUNNER=$(gh variable get CI_RUNNER --repo "$REPO" 2>/dev/null || echo unset)"
    docker ps --filter name=lawbid-ci- --format '{{.Names}} {{.Status}}'
    gh api "repos/$REPO/actions/runners" --jq '.runners[]|"\(.name) \(.status) busy=\(.busy)"'
    ;;
  *) echo "usage: $0 up|down|status" >&2; exit 2 ;;
esac

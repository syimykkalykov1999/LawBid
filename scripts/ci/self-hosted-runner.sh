#!/usr/bin/env bash
# Self-hosted GitHub Actions runners for API CI, on the owner's Linux laptop.
# Runbook: docs/runbooks/self-hosted-runner.md
#
#   scripts/ci/self-hosted-runner.sh up      start N ephemeral runners, set repo variable CI_RUNNER=self
#   scripts/ci/self-hosted-runner.sh down    stop them, set CI_RUNNER back to github (jobs use ubuntu-latest)
#   scripts/ci/self-hosted-runner.sh status
#
# Safety model: every runner is its own container, ephemeral (one job, then it is
# destroyed and recreated with a fresh registration token), no bind mounts of the
# host, no home directory, CPU/RAM limited. Docker for the job's service
# containers is a private Docker-in-Docker sidecar per runner (privileged
# sidecar, NOT the host socket). The registration token is requested with `gh`
# at start and never stored. Workflows send only same-repo PRs and pushes here
# (see api-ci.yml).
#
# Topology of one slot i (why it is built this way):
#   lawbid-ci-dind-i   docker:27-dind, owns the network namespace and the
#                      workspace volume lawbid-ci-work-i mounted at /home/runner/_work
#   lawbid-ci-run-i    the runner, --network container:lawbid-ci-dind-i, same volume,
#                      DOCKER_HOST=tcp://127.0.0.1:2375
#   Sharing the network namespace makes the ports that `services:` publish
#   (5432, 6379, 1025, ...) appear on the runner's localhost, exactly as on
#   ubuntu-latest, and keeps them private to the slot, so N runners never
#   collide on 5432. Sharing the workspace volume at the same path makes
#   `docker run -v "$PWD/...` from a step resolve inside the sidecar. Anything
#   outside the workspace (/tmp) is NOT visible to the sidecar: steps must use
#   $RUNNER_TEMP, not /tmp, for files they hand to docker.
#
# Needs: docker, gh (logged in as a repo admin). Nothing else is installed.
# On a laptop that also runs Docker Desktop, point at the system engine so the
# runners do not share Docker Desktop's VM with whatever else runs there:
#   DOCKER_HOST=unix:///var/run/docker.sock scripts/ci/self-hosted-runner.sh up
set -euo pipefail

REPO="${REPO:-syimykkalykov1999/LawBid}"
COUNT="${RUNNERS:-4}"          # parallel runners (slots)
CPUS="${RUNNER_CPUS:-6}"       # per runner container
MEM="${RUNNER_MEM:-12g}"       # per runner container
DIND_CPUS="${DIND_CPUS:-2}"    # per sidecar: Postgres + Redis + MailHog of one job
DIND_MEM="${DIND_MEM:-2g}"
LABELS="lawbid-ci"
IMG="lawbid-ci-runner:local"
NET="lawbid-ci-net"
WORK="/home/runner/_work"
FLAG="/tmp/lawbid-ci-up"                                   # exists while `up`; supervisors exit when it is gone
LOGDIR="${XDG_STATE_HOME:-$HOME/.local/state}/lawbid-ci"   # one log per slot, supervisor messages only
cmd="${1:-status}"
export REPO CPUS MEM LABELS IMG WORK FLAG

build_image() {
  docker image inspect "$IMG" >/dev/null 2>&1 && return
  d=$(mktemp -d)
  # Static docker CLI from the official image instead of apt's docker.io (which
  # drags in a whole daemon). The runner image already has git, curl, unzip, jq.
  # _work is created in the image so the named volume inherits runner:runner.
  cat >"$d/Dockerfile" <<'D'
FROM docker:27-cli AS cli
FROM ghcr.io/actions/actions-runner:latest
COPY --from=cli /usr/local/bin/docker /usr/local/bin/docker
# lawbid.keep: the host's hourly cleanup (docker image prune --filter label!=lawbid.keep) must not drop this image
LABEL lawbid.keep=1
USER root
RUN mkdir -p /home/runner/_work && chown runner:runner /home/runner/_work
USER runner
D
  docker build -q -t "$IMG" "$d" >/dev/null
  rm -rf "$d"
}

# Supervisor of one slot, runs detached: fresh token -> register ephemeral -> run exactly
# one job -> container exits -> repeat. Exits once `down` removes the flag file.
# The runner registers only after the sidecar daemon answers: dockerd in the
# sidecar needs ~10 s after start (and after every restart), and a job that
# arrives earlier fails in "Initialize containers" (seen live, 02.11).
supervise() {
  local i="$1" tok rc
  while [ -f "$FLAG" ]; do
    # A previous container of this slot may still be finishing a job (rolling restart
    # of the supervisor after a script update): let it finish, never kill a job.
    while [ -n "$(docker ps -q --filter "name=^lawbid-ci-run-$i\$")" ]; do sleep 5; [ -f "$FLAG" ] || return 0; done
    tok=$(gh api -X POST "repos/$REPO/actions/runners/registration-token" --jq .token 2>&1) || tok=""
    if [ -z "$tok" ] || [[ "$tok" == *" "* ]]; then
      echo "$(date -Is) slot $i: no registration token (gh: ${tok:-empty}), retry in 30s"; sleep 30; continue
    fi
    docker run --rm --name "lawbid-ci-run-$i" --network "container:lawbid-ci-dind-$i" \
      --cpus "$CPUS" --memory "$MEM" -v "lawbid-ci-work-$i:$WORK" \
      -e DOCKER_HOST=tcp://127.0.0.1:2375 -e ACTIONS_RUNNER_PRINT_LOG_TO_STDOUT= -e RTOK="$tok" -e REPO="$REPO" -e LABELS="$LABELS" -e NAME="lawbid-ci-$i" \
      "$IMG" bash -c 'for _ in $(seq 1 60); do docker version >/dev/null 2>&1 && break; sleep 1; done; docker version >/dev/null 2>&1 || { echo "sidecar docker daemon not reachable at $DOCKER_HOST"; exit 1; };
                      ./config.sh --unattended --ephemeral --replace --url "https://github.com/$REPO" --token "$RTOK" --labels "$LABELS" --name "$NAME" && ./run.sh' \
      && rc=0 || rc=$?
    echo "$(date -Is) slot $i: runner container exited rc=$rc"
    [ "$rc" -eq 0 ] || sleep 10
  done
  echo "$(date -Is) slot $i: flag gone, supervisor exits"
}

start_one() {
  i="$1"
  docker rm -f "lawbid-ci-dind-$i" "lawbid-ci-run-$i" >/dev/null 2>&1 || true
  docker run -d --name "lawbid-ci-dind-$i" --privileged --network "$NET" --restart unless-stopped \
    --cpus "$DIND_CPUS" --memory "$DIND_MEM" -v "lawbid-ci-work-$i:$WORK" \
    -e DOCKER_TLS_CERTDIR= docker:27-dind >/dev/null
  # setsid: the supervisor must outlive the terminal/session that ran `up`.
  setsid -f bash -c "$(declare -p REPO CPUS MEM LABELS IMG WORK FLAG); $(declare -f supervise); supervise $i" \
    >>"$LOGDIR/slot-$i.log" 2>&1
}

case "$cmd" in
  up)
    gh auth status >/dev/null 2>&1 || { echo "gh is not logged in (gh auth login)" >&2; exit 1; }
    docker info >/dev/null 2>&1 || { echo "docker daemon not reachable (DOCKER_HOST=${DOCKER_HOST:-default context})" >&2; exit 1; }
    if docker info --format '{{.OperatingSystem}}' | grep -q 'Docker Desktop'; then
      echo "warning: using Docker Desktop's VM; prefer DOCKER_HOST=unix:///var/run/docker.sock (system engine)" >&2
    fi
    if [ -f "$FLAG" ] && [ -n "$(docker ps -q --filter name=lawbid-ci-run-)" ]; then
      echo "already up (flag $FLAG and runner containers exist); run 'down' first" >&2; exit 1
    fi
    mkdir -p "$LOGDIR"
    build_image
    docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null
    touch "$FLAG"
    for i in $(seq 1 "$COUNT"); do start_one "$i"; done
    sleep 20
    gh variable set CI_RUNNER --repo "$REPO" --body self
    echo "up: $COUNT runners x ($CPUS cpu, $MEM) + sidecars x ($DIND_CPUS cpu, $DIND_MEM), CI_RUNNER=self, logs in $LOGDIR"
    ;;
  down)
    gh variable set CI_RUNNER --repo "$REPO" --body github
    rm -f "$FLAG"
    docker ps -aq --filter name=lawbid-ci- | xargs -r docker rm -f >/dev/null
    docker volume ls -q --filter name=lawbid-ci-work- | xargs -r docker volume rm -f >/dev/null
    # A slot killed mid-job leaves an offline registration behind; drop those so the list stays honest.
    gh api "repos/$REPO/actions/runners" --jq '.runners[] | select(.name|startswith("lawbid-ci-")) | select(.status=="offline") | .id' \
      | xargs -rI{} gh api -X DELETE "repos/$REPO/actions/runners/{}"
    echo "down: CI_RUNNER=github, jobs use ubuntu-latest"
    ;;
  status)
    echo "CI_RUNNER=$(gh variable get CI_RUNNER --repo "$REPO" 2>/dev/null || echo unset)  flag=$([ -f "$FLAG" ] && echo up || echo down)"
    docker ps --filter name=lawbid-ci- --format '{{.Names}} {{.Status}}'
    gh api "repos/$REPO/actions/runners" --jq '.runners[]|"\(.name) \(.status) busy=\(.busy)"'
    ;;
  *) echo "usage: $0 up|down|status" >&2; exit 2 ;;
esac

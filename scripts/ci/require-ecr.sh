#!/usr/bin/env bash
# Early, readable precondition for ECR (audit 2026-11-02, after two load-test
# smoke runs died on repositories/images nobody had created).
#
#   require-ecr.sh --repo <repo> [<repo> ...]   the repositories exist
#   require-ecr.sh <repo>:<tag> [<repo>:<tag>]  the repositories AND tags exist
#
# Uses only ecr:DescribeImages, which every role that pushes or pulls already
# has (infra/bootstrap deploy role, infra/bootstrap-loadtest): no new IAM. The
# two failure modes are told apart and each names the exact fix:
#   RepositoryNotFoundException -> the repository was never created. No
#     workflow role may create it (no ecr:CreateRepository by design), so it
#     comes from infra/bootstrap (docs/runbooks/ECR_PRECONDITIONS.md).
#   ImageNotFoundException      -> the tag was never pushed; names the workflow.
# Exit 0 = all present; 1 = something missing (every problem is printed, not
# just the first); 2 = usage / unexpected AWS error text is printed as is.
# Env: AWS_CLI (default `aws`, tests put a stub there).
set -u
AWS="${AWS_CLI:-aws}"
[ "$#" -ge 1 ] || { echo "usage: require-ecr.sh --repo <repo>... | <repo>:<tag>..." >&2; exit 2; }
REPO_ONLY=0; [ "$1" = "--repo" ] && { REPO_ONLY=1; shift; }
[ "$#" -ge 1 ] || { echo "usage: require-ecr.sh --repo <repo>... | <repo>:<tag>..." >&2; exit 2; }

fix_for() { # repo -> how the image gets there
  case "$1" in
    lawbid-pgbouncer) echo 'Actions -> "Build PgBouncer" -> Run workflow (tag input)' ;;
    lawbid-clamav)    echo 'Actions -> "Mirror ClamAV" -> Run workflow' ;;
    lawbid-api|lawbid-admin) echo 'the Deploy workflow builds it for every commit on main; pick an image_tag that Deploy pushed' ;;
    *) echo 'push the image first' ;;
  esac
}

bad=0
for arg in "$@"; do
  repo="${arg%%:*}"; tag=""; [ "$REPO_ONLY" = 0 ] && [ "$arg" != "$repo" ] && tag="${arg#*:}"
  if [ "$REPO_ONLY" = 0 ] && [ -z "$tag" ]; then echo "::error::'$arg' has no :tag (use --repo to check a repository only)"; exit 2; fi
  if [ -n "$tag" ]; then
    out="$("$AWS" ecr describe-images --repository-name "$repo" --image-ids "imageTag=$tag" 2>&1)"; rc=$?
  else
    out="$("$AWS" ecr describe-images --repository-name "$repo" --max-items 1 2>&1)"; rc=$?
  fi
  if [ "$rc" = 0 ]; then echo "ok   ECR $arg"; continue; fi
  bad=1
  case "$out" in
    *RepositoryNotFoundException*)
      echo "::error::ECR repository '$repo' does not exist. Workflow roles cannot create repositories (no ecr:CreateRepository on purpose). Create it once with infra/bootstrap (terraform apply, owner's Mac) or, only the missing repository, 'aws ecr create-repository --repository-name $repo --image-tag-mutability IMMUTABLE --image-scanning-configuration scanOnPush=true' (docs/runbooks/ECR_PRECONDITIONS.md)." ;;
    *ImageNotFoundException*)
      echo "::error::ECR image '$arg' does not exist. Make it with: $(fix_for "$repo")." ;;
    *)
      echo "::error::ECR check for '$arg' failed with an unexpected error (permissions? region?): $out" ;;
  esac
done
exit "$bad"

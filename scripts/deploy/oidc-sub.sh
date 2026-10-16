#!/usr/bin/env sh
# Diagnostics for «Not authorized to perform sts:AssumeRoleWithWebIdentity»:
# prints the claims AWS checks in the role's trust policy (sub, aud, repo,
# ref) from this job's GitHub OIDC token. The token itself is never printed.
# Needs `permissions: id-token: write`. Compare `sub` with
# `aws iam get-role --role-name lawbid-prod-github-deploy
#   --query Role.AssumeRolePolicyDocument` (infra/bootstrap/main.tf).
set -eu
echo "repository=$GITHUB_REPOSITORY ref=$GITHUB_REF event=$GITHUB_EVENT_NAME"
[ -n "${ACTIONS_ID_TOKEN_REQUEST_URL:-}" ] || { echo "no id-token permission in this job"; exit 0; }
RESP=$(curl -sS -H "Authorization: bearer $ACTIONS_ID_TOKEN_REQUEST_TOKEN" "$ACTIONS_ID_TOKEN_REQUEST_URL&audience=sts.amazonaws.com")
RESP="$RESP" node -e '
  const t = JSON.parse(process.env.RESP).value;
  const c = JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());
  for (const k of ["sub", "aud", "repository", "ref", "environment", "job_workflow_ref"]) console.log(k + "=" + c[k]);
'

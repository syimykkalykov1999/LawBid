# Automation audit 2026-11-08: the local state of infra/bootstrap is not on the
# Mac any more, while every resource below exists in AWS (listed read-only with
# the AWS CLI on 08.11). These import blocks adopt them, so a plan shows only
# imports plus what is really new (lawbid-pgbouncer ECR repo and its lifecycle,
# the tfstate lifecycle rule, the GitHub notify / inventory / cleanup / plan
# roles, and the deploy-role permissions added since 06.10). Terraform >= 1.5.
# Safe to keep after the apply: an import block whose resource is in state is a no-op.

import {
  to = aws_s3_bucket.tfstate
  id = "lawbid-prod-tfstate"
}
import {
  to = aws_s3_bucket_versioning.tfstate
  id = "lawbid-prod-tfstate"
}
import {
  to = aws_s3_bucket_server_side_encryption_configuration.tfstate
  id = "lawbid-prod-tfstate"
}
import {
  to = aws_s3_bucket_public_access_block.tfstate
  id = "lawbid-prod-tfstate"
}
import {
  to = aws_dynamodb_table.tflock
  id = "lawbid-prod-tflock"
}
import {
  for_each = toset(["lawbid-api", "lawbid-admin", "lawbid-clamav"])
  to       = aws_ecr_repository.app[each.key]
  id       = each.key
}
# ECR lifecycle policies are NOT imported: the live ones ("keep last 30") differ
# from the code, and a changed policy forces a replacement of an imported one.
# Created instead, PutLifecyclePolicy simply overwrites the live document (no
# images are touched by the swap itself; the new rules keep 60 / 5 per repo).
import {
  to = aws_acm_certificate.app
  id = "arn:aws:acm:us-east-1:047754151252:certificate/8981a845-cf8c-4f75-869c-4e5afe8b82af"
}
import {
  to = aws_iam_openid_connect_provider.github
  id = "arn:aws:iam::047754151252:oidc-provider/token.actions.githubusercontent.com"
}
import {
  to = aws_iam_role.deploy
  id = "lawbid-prod-github-deploy"
}
import {
  to = aws_iam_role_policy.deploy
  id = "lawbid-prod-github-deploy:terraform-20261006225709334800000002"
}

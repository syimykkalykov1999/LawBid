# Stage 2 SRE (Б8): every application secret has a copy in the disaster-recovery region
# when replica_region is set; empty = exactly as before (no replica).
#   terraform -chdir=infra/modules/secrets init -backend=false
#   terraform -chdir=infra/modules/secrets test

mock_provider "aws" {}

variables {
  name        = "lawbid-test"
  kms_key_arn = "arn:aws:kms:us-east-1:111111111111:key/main"
  names       = ["DATABASE_URL", "JWT_KEYS", "MESSAGE_ENC_KEYS"]
}

run "no_replica_by_default" {
  command = plan
  assert {
    condition     = alltrue([for s in aws_secretsmanager_secret.this : length(s.replica) == 0])
    error_message = "without replica_region no secret is replicated"
  }
}

run "every_secret_has_a_replica_in_us_west_2" {
  command = plan
  variables {
    replica_region      = "us-west-2"
    replica_kms_key_arn = "arn:aws:kms:us-west-2:111111111111:key/dr"
  }
  assert {
    condition     = length(aws_secretsmanager_secret.this) == 3 && alltrue([for s in aws_secretsmanager_secret.this : length(s.replica) == 1 && one(s.replica).region == "us-west-2" && one(s.replica).kms_key_id == "arn:aws:kms:us-west-2:111111111111:key/dr"])
    error_message = "each secret has exactly one replica in us-west-2 with the DR-region key"
  }
}

# infra — Terraform (docs/06_PRODUCTION.md §6)

AWS infrastructure for `staging` and `prod` (separate accounts, same
stack, different sizes — §6.2). Written and validated in stage 6.10
(`terraform validate` for both environments); **not applied yet** — the
first `apply` needs the owner's AWS accounts, a CockroachDB Cloud cluster
and the registrar/DNS access listed below.

```
infra/
  modules/
    network/     VPC, 2 AZs, public + private subnets, NAT per AZ, VPC endpoints
    kms/         one CMK per environment (S3, Secrets Manager, logs, Redis)
    s3/          documents (private, versioned, SSE-KMS, cross-region replica),
                 media (private + CloudFront OAC), lifecycle rules
    redis/       ElastiCache for Redis 7 (multi-AZ, TLS, AUTH, REDIS_URL secret)
    secrets/     Secrets Manager entries for every secret env var (values set out of band)
    ses/         sending domain: DKIM, MAIL FROM, DMARC (Route 53 records optional)
    alb/         ALB (HTTPS only, idle 300 s for WebSockets, sticky api target group) + WAF
    ecs/         Fargate cluster; services api / worker / admin; one-off migrate task;
                 autoscaling CPU 60 % (min 2 tasks), circuit breaker + rollback
    monitoring/  SNS alerts, log metric filters, CloudWatch alarms (docs/06 §8)
    stack/       composes the above for one environment
  envs/
    staging/     backend + providers + variables (reduced sizes)
    prod/        same, production sizes
  observability/ Grafana dashboards (CloudWatch data source)
```

## Prerequisites (once per account)

1. State backend: an S3 bucket (versioned, SSE) and a DynamoDB lock table,
   names as in `envs/<env>/backend.hcl.example`.
2. An ACM certificate in the main region covering `api.<domain>` and
   `admin.<domain>` (`certificate_arn`).
3. ECR repositories `lawbid-api` and `lawbid-admin` (the deploy workflow
   pushes there; images are referenced by tag in `api_image` / `admin_image`).
4. **CockroachDB Cloud** (dedicated, 3 nodes, multi-AZ, backups + PITR —
   §6.1/§6.4) is created in the CockroachDB console, not here. Create the
   roles of docs/02 §6.3 (`lawbid_migrator`, `lawbid_app`,
   `lawbid_retention`, `lawbid_readonly`) and allow the VPC's NAT IPs.

## Apply

```sh
cd infra/envs/staging
cp backend.hcl.example backend.hcl && cp terraform.tfvars.example terraform.tfvars   # fill in
terraform init -backend-config=backend.hcl
terraform plan
terraform apply
```

After the first apply:

1. Fill the secrets printed by `terraform output secrets_to_fill`
   (`aws secretsmanager put-secret-value --secret-id lawbid-staging/<NAME> …`):
   the three CockroachDB connection strings (`DATABASE_URL` = `lawbid_app`,
   `MIGRATOR_DATABASE_URL` = `lawbid_migrator`, `RETENTION_DATABASE_URL` =
   `lawbid_retention`), `JWT_KEYS`, the OTP/auth peppers,
   `ADMIN_TOTP_ENC_KEY`, Twilio, Stripe (test keys on staging — §6.2), FCM,
   Sentry, and the provider keys that stay empty until the paid flags are
   turned on (docs/06 §2.3 п.7). `REDIS_URL` is written by Terraform.
   Secrets are injected into the tasks by ECS at start; they are never in
   the task definition, the image or the logs.
2. Add the DNS records from `terraform output ses_dns` (or pass
   `hosted_zone_id` to let Terraform create them), then request SES
   production access.
3. Run the migrations once (`aws ecs run-task` with
   `migrate_task_definition_arn`, the deploy workflow does this on every
   release) and roll the services (`.github/workflows/deploy.yml`).
4. Confirm the alert e-mail subscriptions (SNS sends a confirmation).

## Acceptance of stage 6.10 (to be run by the owner on the real account)

- `terraform apply` brings staging up from nothing.
- `https://api.<staging domain>/health/ready` answers 200; a Socket.IO
  client connects through the ALB (idle timeout 300 s, sticky sessions).
- Migrations run as the `migrate` task, not inside the services.
- `aws ecs describe-task-definition` shows only `valueFrom` secret
  references; CloudWatch logs carry no secret values (pino redaction,
  docs/06 §4.3).

## Decisions

- The admin panel runs as a third ECS service (`admin`, Next.js
  standalone image) behind the same ALB instead of a static CloudFront
  site: its API proxy and httpOnly-cookie session (docs/06 §2.1) need a
  server. Recorded as OQ-023.
- Redis and CockroachDB are private (no public endpoints); the tasks reach
  AWS APIs through VPC endpoints and the internet (Stripe, Twilio, FCM)
  through the NAT gateways.

## State and secrets

The state contains the generated Redis AUTH token (`random_password`).
The state bucket must be SSE-KMS encrypted with access limited to the
deploy role and the owner; never commit `terraform.tfstate` or copy it
into tickets. All other secret values are set outside Terraform.

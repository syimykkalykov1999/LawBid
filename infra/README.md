# infra — Terraform (docs/06_PRODUCTION.md §6)

AWS infrastructure for `staging` and `prod` (separate accounts, same
stack, different sizes — §6.2). Written and validated in stage 6.10
(`terraform validate` for both environments); **not applied yet** — the
first `apply` needs the owner's AWS accounts, a managed PostgreSQL 16 database
and the registrar/DNS access listed below.

```
infra/
  modules/
    postgres/    RDS PostgreSQL 16 with daily backups + point-in-time restore (opt-in: create_database = true)
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
    monitoring/  SNS alerts, log metric filters, CloudWatch alarms (docs/06 §8);
                 descriptions in plain Russian with «что делать» + runbook link
    budget/      monthly AWS budget e-mails + Cost Anomaly Detection
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
4. **Managed PostgreSQL 16** (multi-AZ, automated backups + PITR —
   §6.1/§6.4; e.g. AWS RDS, Neon or Supabase — the owner picks the host,
   see docs/runbooks/PROD_LAUNCH.md step 4) is created in the host's
   console (or in RDS), not here. Create the
   roles of docs/02 §6.3 (`lawbid_migrator`, `lawbid_app`,
   `lawbid_retention`, `lawbid_readonly`) and allow the VPC's NAT IPs.

## Launch size

`envs/prod/launch.tfvars.example` is the small starting size (one api and
one worker task, t4g.micro Redis without a replica, one NAT gateway, no
interface endpoints; ≈ $140/month of AWS at 2026-10 prices). Growing is a
change of numbers in `terraform.tfvars` and `terraform apply`: the
variables without an override keep the full-size defaults of
`variables.tf` (min 2 tasks, r7g.large Redis with a replica, NAT per AZ).

## Apply

**Prod first launch: follow [docs/runbooks/PROD_LAUNCH.md](../docs/runbooks/PROD_LAUNCH.md)**
(`infra/bootstrap` creates the prerequisites below; `scripts/deploy/prod-*.sh`
fill the secrets, set up the database and seed it). The prod API connects
as `lawbid_app` (the migration `20261007000000_prod_role_privileges` gives
that role every table, now and future); the launch database is a small managed PostgreSQL instance, not the
multi-AZ setup of «Prerequisites».

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
   the three PostgreSQL connection strings (TLS required) (`DATABASE_URL` = `lawbid_app`,
   `MIGRATOR_DATABASE_URL` = `lawbid_migrator`, `RETENTION_DATABASE_URL` =
   `lawbid_retention`), `JWT_KEYS`, the OTP/auth peppers,
   `ADMIN_TOTP_ENC_KEY`, `SECRETS_MASTER_KEYS` (`k1:<random 48+ chars>`),
   `MESSAGE_ENC_KEYS` (`m1:<random 48+ chars>`, chat texts at rest; keep it
   forever, losing it makes stored messages unreadable), Twilio, Stripe (test keys on staging — §6.2), FCM,
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
5. Zero maintenance (docs/ZERO_MAINTENANCE.md): run
   `infra/postgres/role-settings.sql` once (`psql … -f`) (statement / idle-transaction
   timeouts per role); after the host is chosen, the read-only key of its backup API goes
   into the admin (Ключи и сервисы → Хостинг базы данных; until then the
   backup-freshness check only warns); optionally a
   read-only OIDC role `AWS_SELFCHECK_ROLE_PROD` for
   `.github/workflows/self-check.yml` (falls back to the deploy role).
   `monthly_budget_usd` creates the AWS budget (e-mails 50/80/100 %, the
   worker caps autoscaling at the minimum at 100 %) and Cost Anomaly
   Detection (`create_anomaly_monitor = false` if the account already has
   a service monitor). A cap set from the admin is reset to the Terraform
   ceiling by the next `terraform apply`.

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
- Redis and PostgreSQL are private (no public endpoints); the tasks reach
  AWS APIs through VPC endpoints and the internet (Stripe, Twilio, FCM)
  through the NAT gateways.

## State and secrets

The state contains the generated Redis AUTH token (`random_password`).
The state bucket must be SSE-KMS encrypted with access limited to the
deploy role and the owner; never commit `terraform.tfstate` or copy it
into tickets. All other secret values are set outside Terraform.

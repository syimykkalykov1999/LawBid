## Stage 6.10 — Infrastructure (Terraform)

docs/06_PRODUCTION.md §13 stage 6.10, §6.

- `infra/modules`: network (VPC, 2 AZ, NAT per AZ, VPC endpoints), kms,
  s3 (documents private/versioned/SSE-KMS with cross-region replication,
  media behind CloudFront OAC, lifecycle for exports and old versions),
  redis (ElastiCache 7, multi-AZ, TLS, AUTH token → `REDIS_URL` secret),
  secrets (Secrets Manager entry per secret env var, values out of band),
  ses (domain identity, DKIM, MAIL FROM, DMARC), alb (HTTPS only, idle
  300 s for WebSockets, sticky api target group, WAF managed rules +
  per-IP rate rule), ecs (Fargate: `api`, `worker`, `admin` services from
  two images, one-off `migrate` task for `prisma migrate deploy` under
  `lawbid_migrator`, CPU-60 % autoscaling with min 2 tasks, deployment
  circuit breaker with rollback, secrets injected by ECS), monitoring
  (SNS → email/Slack, log metric filters, the alarms of §8), stack
  (composition) and `envs/staging`, `envs/prod` (S3 backend + lock,
  example tfvars/backend files, reduced vs production sizes).
- `apps/admin/Dockerfile` (Next.js standalone) and `output: 'standalone'`.
- Validated with `terraform fmt -check` and `terraform validate` for both
  environments (Terraform 1.9.8, AWS provider 5.100). Not applied: no AWS
  account in this session — the acceptance steps are listed in
  `infra/README.md`. OQ-023 (admin as an ECS service).

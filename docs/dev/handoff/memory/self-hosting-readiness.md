---
name: self-hosting-readiness
description: Owner 2026-10-28 — prepare code now for a later move from AWS to own servers/data centers; every AWS service behind a switchable adapter, OFF/hidden; migration plan with no data loss
metadata:
  type: project
---

Owner 2026-10-28: «заранее подготовим, когда у нас мало данных» — the code must be ready to move off AWS to our own servers/data centers so that later it is servers + a switch, not a rewrite or a $1M project. Today ~60–70 % portable (containers, Postgres, Redis, sharding marks, Terraform); ~10 AWS-bound services lack adapters: S3, CloudFront CDN, SES mail, Secrets Manager, ECS autoscale, CloudWatch alarms, Amazon Location, ClamAV mirror/ECR, EventBridge schedules/Lambdas, KMS.

**Why:** cloud becomes expensive at scale; moving with little data is cheap, with lots of data it is slow and risky.

**How to apply:** after the test phase: one provider-agnostic adapter per AWS service with switch «AWS / свой сервер» (default AWS, self-hosted path hidden/off), open-source counterparts (MinIO, Prometheus/Alertmanager, Postfix/own SMTP or other, Vault/sops, Kubernetes/Nomad, Photon/Pelias for geocoding), a no-data-loss migration runbook + admin guide (dual-write / replicate then cut over), and a cost comparison. Related: [[scaling-principle]], [[test-phase-plan]].

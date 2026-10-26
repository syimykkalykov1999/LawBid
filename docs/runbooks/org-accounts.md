# AWS Organizations: переезд на отдельные аккаунты (prod / staging / log-archive)

Стоимость: $0. AWS Organizations и SCP бесплатны; платишь только за ресурсы в аккаунтах (второй аккаунт сам по себе ничего не стоит). Сейчас всё в одном аккаунте; этот документ нужен, когда решишь разделить.

Источники (проверены 2026-10-25, дат публикации на страницах нет, это живая документация): AWS Organizations User Guide, "Service control policy examples"; AWS Control Tower / Security Reference Architecture (рекомендация отдельных аккаунтов management, log-archive, security-tooling, workload). Перед применением сверь список глобальных сервисов в region-lock SCP с текущей страницей примеров.

## Зачем

- Ошибка или взлом в staging не достаёт prod.
- Логи (CloudTrail, Config) лежат в отдельном аккаунте, куда с prod не добраться, даже администратору prod.
- SCP из `infra/modules/org-guardrails` физически не дают отключить аудит.

## Шаги

1. Создать Organization (консоль AWS Organizations, Create organization, "All features"). Текущий аккаунт станет management. Лучше, чтобы management НЕ запускал рабочую нагрузку: поэтому шаг 3.
2. Включить тип политик SCP: Organizations, Policies, Service control policies, Enable.
3. Создать новые аккаунты (Organizations, Add an AWS account, Create): `lawbid-prod`, `lawbid-staging`, `lawbid-log-archive`. Каждому уникальный email (alias `+prod` у почты работает). Роль `OrganizationAccountAccessRole` создаётся сама.
4. На root каждого нового аккаунта: MFA (аппаратный ключ), без ключей доступа (см. Config rules `root-account-mfa-enabled`, `iam-root-access-key-check`).
5. Создать OU: `Workloads` (prod, staging) и `Security` (log-archive). Перенести аккаунты.
6. Применить `org-guardrails` СНАЧАЛА к тестовому OU или staging, с `exempt_principal_arns` для роли Terraform-деплоя. Проверить `terraform plan` в staging (UpdateTrail, detector, регионы). Потом на `Workloads`.
7. Перенос рабочей нагрузки: в новом аккаунте поднять стек теми же модулями (`infra/envs/prod`, backend state в новом аккаунте). Данные переносить через снимок RDS, share snapshot, copy; S3 через replication/`aws s3 sync`; секреты пересоздать. DNS переключить в Cloudflare в окно обслуживания. Это отдельный проект, не часть этого PR.
8. Логи: CloudTrail organization trail в log-archive (Organizations, CloudTrail, enable trusted access), бакет в log-archive с политикой "только запись". Config: aggregator в log-archive или security аккаунте.
9. Billing остаётся в management: Budgets и Cost Anomaly Detection смотрят на всю организацию (consolidated billing); заведи монитор ещё и по linked account.
10. Break-glass роль завести в каждом аккаунте; человек входит из management через SSO/IAM Identity Center.

## Откат

SCP отсоединяется одной командой (`terraform destroy -target` модуля или Detach policy в консоли); аккаунты можно оставить. Если застрял из-за SCP, зайди management-аккаунтом: SCP на него не действуют.

## Риски

- SCP может заблокировать собственный деплой (например `cloudtrail:UpdateTrail`): поэтому `exempt_principal_arns` и пробный OU.
- Лимит: 5 SCP на цель, включая FullAWSAccess; модуль использует ровно 4 дополнительных.
- Region-lock: сервисы без регионов (IAM, STS, Route 53, CloudFront, billing) исключены по списку AWS; если что-то глобальное всё же блокируется, добавь в `extra_global_actions`.

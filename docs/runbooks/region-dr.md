# Потеря региона AWS: восстановление в us-west-2 (DR)

## Коротко для владельца
Если весь регион AWS `us-east-1` пропадёт надолго (такое бывает раз в несколько лет и длится часы), LawBid поднимается заново во втором регионе `us-west-2`. Там уже лежат каждую ночь копия базы, образы сервера и все секреты. Подъём делается по шагам ниже. Цель: **сервис снова работает за 8 часов (RTO ≤ 8 ч)**, теряется **не больше суток данных (RPO ≤ 24 ч)**: это возраст последней ночной копии базы. Деньги: пока аварии нет, второй регион почти ничего не стоит. Во время аварии он стоит как обычный прод. Решение «поднимаем» принимает владелец.

Стратегия: «backup & restore» из AWS Well-Architected, Reliability, REL13-BP02 («Use defined recovery strategies to meet the recovery objectives»), самая дешёвая из четырёх (backup & restore / pilot light / warm standby / multi-site active-active). Учения раз в год (REL13-BP03 «Test disaster recovery implementation to validate the implementation»). Источники: docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_planning_for_recovery_disaster_recovery.html, whitepaper «Disaster Recovery of Workloads on AWS: Recovery in the Cloud» (AWS, 2021, актуален), Google SRE Workbook гл. 9.

## Что уже готово заранее (код)
| Что | Где лежит в us-west-2 | Как туда попадает | RPO |
|---|---|---|---|
| База PostgreSQL | хранилище AWS Backup `lawbid-prod-db-dr` | план `lawbid-prod-db-daily`, каждую ночь 06:00 UTC (`infra/modules/backup`, `backups.md`) | ≤ 24 ч |
| Файлы дел и чатов (S3 documents) | бакет `*-documents-replica` | репликация S3 сразу при записи (`infra/modules/s3`) | минуты |
| Публичные фото | Cloudflare R2 | вне AWS, регион не важен | 0 |
| Образы `lawbid-api/admin/clamav/pgbouncer` | ECR us-west-2 | репликация ECR каждого нового образа (`infra/bootstrap/ecr-replica.tf`, `infra/modules/ecr-replica`) | 0 для образов после включения |
| Секреты (`lawbid-prod/*`) | Secrets Manager us-west-2 (реплики) | репликация Secrets Manager (`secrets_replica_enabled`, `infra/modules/secrets`; по умолчанию выключено, пока владелец не применит `infra/bootstrap`: bootstrap → true → apply прода) | 0 |
| Состояние terraform | бакет `lawbid-prod-tfstate-replica` | `state_replica_enabled` (bootstrap) | минуты |
| Страница статуса | Cloudflare R2 `status/` | воркер каждую минуту (`STATUS_PAGE.md`) | — |
| Redis | нет | не источник правды, пересобирается сам | — |
| Описание всего стека | `infra/envs/dr` (тот же `modules/stack`, регион us-west-2, база из копии) | код | — |

## RTO по шагам (цель ≤ 8 ч)
| Шаг | Кто | Оценка |
|---|---|---|
| 0–1. Объявить SEV1, решить «поднимаем» | владелец | 0,5 ч (решение ждать или переезжать: если AWS обещает вернуть регион быстрее 4 ч — ждём) |
| 2. Сеть DR и восстановление базы из копии | Claude + владелец (вход в AWS) | 2–3 ч (восстановление RDS из копии занимает основное время) |
| 3. Секреты в `lawbid-dr/*` | Claude | 0,5 ч |
| 4. Сертификат ACM в us-west-2 | владелец (DNS-запись) | 0,5 ч |
| 5. `terraform apply` `envs/dr`, миграции | владелец (apply), Claude (проверка) | 1–1,5 ч |
| 6. DNS на новый балансировщик | владелец (Cloudflare / Namecheap) | 0,5 ч (+ TTL) |
| 7. Проверка и наблюдение | Claude | 1 ч |
| **Итого** | | **6–7,5 ч** |

## Шаги

### 0. Объявить
Issue «Авария (incident)» SEV1 (`INCIDENT.md`), страница статуса: если AWS лежит, запасная копия в R2 (`STATUS_PAGE.md`, «Если лежит AWS»). Проверить AWS Health Dashboard (`health.aws.amazon.com`) — это правда потеря региона, а не наш сбой (тогда `INCIDENT.md`, обычные инструкции).

### 1. Решить
Владелец: поднимаем ли DR. Цена: данные за последние ≤ 24 ч (после ночной копии) пропадут из новой базы. Деньги и Stripe: платежи за это время остаются в Stripe, сверка после возврата (`STRIPE_ROBUSTNESS.md`).

### 2. Сеть и база
```sh
export AWS_REGION=us-west-2
cd infra/envs/dr && cp backend.hcl.example backend.hcl && cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
# Сначала только сеть, чтобы было куда восстановить базу:
terraform apply -target=module.stack.module.network
# Самая новая копия базы в хранилище DR:
aws backup list-recovery-points-by-backup-vault --backup-vault-name lawbid-prod-db-dr \
  --query 'reverse(sort_by(RecoveryPoints,&CreationDate))[0].[RecoveryPointArn,CreationDate]'
# Группа подсетей для базы из частных подсетей новой сети (вывод terraform output / консоль VPC):
aws rds create-db-subnet-group --db-subnet-group-name lawbid-dr-db --db-subnet-group-description "DR" \
  --subnet-ids <private subnet 1> <private subnet 2>
# Восстановление (AWS Backup → Backup vaults → lawbid-prod-db-dr → recovery point → Restore, или CLI):
aws backup start-restore-job --recovery-point-arn <arn> --iam-role-arn <AWSBackupDefaultServiceRole arn> \
  --metadata DBInstanceIdentifier=lawbid-dr-postgres,DBSubnetGroupName=lawbid-dr-db,MultiAZ=false
aws backup describe-restore-job --restore-job-id <id>   # ждать COMPLETED
```
`restored_database_identifier = "lawbid-dr-postgres"` в `terraform.tfvars`.

### 3. Секреты
Реплики `lawbid-prod/*` в us-west-2 только читаются. Стек DR заводит свои `lawbid-dr/*` и берёт значения оттуда:
```sh
terraform apply -target=module.stack.module.secrets
for n in $(aws secretsmanager list-secrets --query "SecretList[?starts_with(Name,'lawbid-prod/')].Name" --output text); do
  v=$(aws secretsmanager get-secret-value --secret-id "$n" --query SecretString --output text)
  aws secretsmanager put-secret-value --secret-id "lawbid-dr/${n#lawbid-prod/}" --secret-string "$v" >/dev/null
done
```
Потом в `lawbid-dr/DATABASE_URL`, `RETENTION_DATABASE_URL`, `MIGRATOR_DATABASE_URL`, `PARTITION_DATABASE_URL` заменить хост на адрес восстановленной базы (`aws rds describe-db-instances --db-instance-identifier lawbid-dr-postgres --query 'DBInstances[0].Endpoint.Address'`). Значения не печатать в чат и не коммитить.

### 4. Сертификат
Владелец: ACM в us-west-2 → Request → `api.lawbid.dev`, `admin.lawbid.dev` → DNS validation → добавить CNAME-записи в Cloudflare (DNS only) / Namecheap. ARN вписать в `certificate_arn`.

### 5. Стек и миграции
`image_tag` = последний хороший тег прода (SSM `/lawbid-prod/deploy/last_good_tag`, если регион доступен для чтения, иначе самый новый в DR ECR: `aws ecr describe-images --repository-name lawbid-api --query 'reverse(sort_by(imageDetails,&imagePushedAt))[0].imageTags'`). `min_tasks = 2`, `admin_tasks = 1`.
```sh
terraform plan -out dr.plan && terraform apply dr.plan
```
База из копии может быть старше образа: миграции только добавляющие, их надо догнать задачей migrate (как `scripts/deploy/run-migrations.sh`, кластер `lawbid-dr`).

### 6. DNS
Владелец: `api` и `admin` → CNAME на балансировщик DR (`terraform output` → `stack.alb_dns_name`), облачко серое. Сайт `lawbid.dev` на CloudFront: CloudFront глобальный, но его сертификат живёт в us-east-1. Если CloudFront работает, сайт продолжает ходить в API по новому адресу.

### 7. Проверить
`https://api.lawbid.dev/health/ready` = 200, вход, лента, чат, оплата в тестовом режиме, `scripts/ops/self-check.sh`. Страница статуса: воркер DR пишет копию в R2 сам (те же ключи R2 в секретах).

### Известные пробелы (честно)
- Файлы дел: строки в базе хранят имя бакета прода (`lawbid-prod-documents`), а копия лежит в `*-documents-replica`. До переезда нужна копия объектов в бакет DR (`aws s3 sync s3://<documents-replica> s3://<documents бакет DR>`, S3 Batch Operations для больших объёмов) и сопоставление имени бакета. Это отдельный пункт после первого учения.
- Образы старше включения репликации ECR в us-west-2 не попадают. Перед первым учением один раз переложить туда текущий тег (`aws ecr batch-get-image` + `put-image`, или любой новый выкат: каждый новый образ ECR копирует сам).

## Возврат в us-east-1
Когда регион вернётся: остановить запись (режим «минимум» в админке), снять копию базы DR (`aws rds create-db-snapshot`), скопировать её в us-east-1 (`aws rds copy-db-snapshot --source-region us-west-2`), восстановить, вернуть DNS, `terraform destroy` в `envs/dr` (база DR — последней, после проверки).

## Учение раз в год (REL13-BP03)
С `min_tasks = 0`: шаги 2–5 до `terraform apply` без трафика, проверка, что база восстановилась и задачи стартуют при `min_tasks = 1` на 10 минут, потом `terraform destroy` и удаление восстановленной базы. Записать строку в `chaos-and-restore-drills.md`, часть 3: сколько занял каждый шаг (настоящее RTO) и возраст копии (настоящее RPO). Стоимость учения: несколько долларов (часы RDS и Fargate).

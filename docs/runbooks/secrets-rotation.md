# Автоматическая смена паролей и ключей (secrets rotation)

## Коротко для владельца (5 строк)

1. Пароль базы, токен Redis и три списка ключей (входы, чаты, «Ключи и сервисы») меняются **сами**: базе раз в 30 дней, остальному раз в 90.
2. Сначала новый секрет добавляется **рядом** со старым, и старый ещё работает; приложение перезапускается по одному серверу — пользователи ничего не замечают.
3. Новый ключ начинает подписывать/шифровать через 6 часов после добавления; старые ключи остаются, пока ещё нужны (входы — 2 дня, чаты и ключи сервисов — пока их не перешифруют).
4. Всё **выключено**, пока вы не включите в `secret_rotation` (по одной части, порядок ниже); стоит около $2 в месяц.
5. Дата последней и следующей смены видна в админке «Здоровье системы» → «Смена паролей и ключей»; если смена просрочена или сорвалась — придёт письмо (алерт `…-secret-rotation-problems`).

---

## Что и как меняется

| Секрет | Чем меняется | Окно «старое + новое» |
|---|---|---|
| Логин базы (`DB_APP_CREDENTIALS` → `DATABASE_URL`, им же пользуется PgBouncer) | **готовая функция AWS** «PostgreSQLMultiUser» (два пользователя `lawbid_app` и `lawbid_app_clone`, пароль меняется у того, что не используется сейчас) | предыдущий пользователь действует целый период (30 дней) |
| Токен Redis (`REDIS_URL`, `REDIS_CACHE_URL`) | наша функция `rotator.py` (у AWS готового шаблона для токена нет): ElastiCache `ROTATE` (действуют оба токена) → перезапуск → через 24 ч `SET` (старый выключен) | 24 ч |
| `JWT_KEYS` | `rotator.py` добавляет ключ `jN+1` в конец списка | новый активен через 6 ч; старый ключ убирается через 2 дня (токены доступа живут минуты; refresh-токены не JWT) |
| `MESSAGE_ENC_KEYS`, `SECRETS_MASTER_KEYS` | то же; если в списке уже есть записи `kms:…`, новая тоже оборачивается в KMS (`DATA_KEYS_KMS_KEY_ARN`) | старые ключи **не удаляются сами** (см. «Убрать старый ключ») |

Как приложение подхватывает новое: ECS читает секреты **только при старте задачи**. Поэтому функция `…-secret-rotation-ops` (раз в час) после смены делает `UpdateService forceNewDeployment` для api, worker и (если включён) pgbouncer — обычный плавный перезапуск, как при выкладке. Где два пользователя / два токена / несколько ключей действуют одновременно, задача со «старым» значением продолжает работать до своей замены.

Порядок «ключ → активный ключ»: `JWT_ACTIVE_KID`, `SECRETS_ACTIVE_KID`, `MESSAGE_ENC_ACTIVE_KID` при включении `keys_enabled` становятся **секретами** (а не переменными в task definition); их меняет только функция, после `grace_hours`.

Перешифровка уже есть в приложении: чаты — задача `messages.reencrypt` (порциями по 500, с паузой, с курсором в Redis, переживает перезапуск; перезапускается сама при новом активном ключе); «Ключи и сервисы» — кнопка «Перешифровать» (`SecretsService.reencrypt`). Отдельного кода перешифровки не добавлено.

## Включение (владелец, по порядку; каждый шаг отдельно, между ними убедитесь, что сайт жив)

`terraform apply` делает владелец. Ничего из ниже не выполняется само.

### 0. Ключи приложения (самое безопасное)
`terraform.tfvars` (prod): `secret_rotation = { keys_enabled = true }` → plan покажет 3 новых секрета `*_ACTIVE_KID` (значения `j1`/`k1`/`m1`, как сейчас в task definition), 1 Lambda `rotator`, 1 Lambda `ops`, расписание, 2 алерта; из task definition пропадут 3 переменные `*_ACTIVE_KID` (теперь они секреты) — задачи перезапустятся один раз при apply. Ключи начнут меняться по расписанию (первый раз через 90 дней). Принудительно, для проверки — см. «Проверка».

### 1. Redis
`secret_rotation = { keys_enabled = true, redis_enabled = true }`. Модуль redis теперь игнорирует `auth_token` и значение секрета `REDIS_URL` (их ведёт ротация) — это **единственное** изменение существующих ресурсов; plan не должен менять сам Redis. Первый токен остаётся тем, что создал Terraform.

### 2. База (нужен мастер-секрет)
1. Мастер-пользователь должен лежать в Secrets Manager в формате JSON `{"username":…,"password":…,"engine":"postgres","host":…,"port":5432,"dbname":…}`. Самое чистое — включить в RDS «Manage master credentials in Secrets Manager» (Modify → без простоя; AWS сам меняет пароль мастера раз в 7 дней). Либо создать такой секрет вручную. Его ARN → `db_master_secret_arn` (если он зашифрован своим KMS-ключом — ещё `db_master_secret_kms_arn`).
2. `secret_rotation = { …, db_enabled = true, db_master_secret_arn = "arn:aws:secretsmanager:…" }`. Создастся пустой секрет `lawbid-prod/DB_APP_CREDENTIALS` и функция AWS (в вашей VPC, с группой безопасности задач — она уже допущена к базе).
3. Один раз заполните JSON из текущего `DATABASE_URL` (пароль в чат не попадает):
   `aws lambda invoke --function-name lawbid-prod-secret-rotation-ops --payload '{"mode":"bootstrap-db"}' --cli-binary-format raw-in-base64-out /dev/stdout`
4. Проверьте первую смену вручную (см. «Проверка»).

Ограничение: ротация касается роли приложения (`DATABASE_URL`). `MIGRATOR_DATABASE_URL`, `RETENTION_DATABASE_URL`, `DEMO_DATABASE_URL` не меняются (там права на DDL / отдельные роли; меняются вручную по [DEPLOY_PROD.md](DEPLOY_PROD.md)). Пользователь `lawbid_app_clone` создаётся AWS при первой смене и получает права через членство в роли `lawbid_app` — **перед включением на проде прогоните на staging/копии** (Prisma-запросы, миграции под клоном).

## Проверка (после включения каждой части)

```
# принудительная смена сейчас (имя секрета: lawbid-prod/<ИМЯ>)
aws secretsmanager rotate-secret --secret-id lawbid-prod/JWT_KEYS
aws secretsmanager describe-secret --secret-id lawbid-prod/JWT_KEYS --query '{last:LastRotatedDate,next:NextRotationDate}'
aws lambda invoke --function-name lawbid-prod-secret-rotation-ops --payload '{}' /dev/stdout
```
Ожидаемо: у секрета появилась дата `LastRotatedDate`; в списке ключей добавился ключ (проверка без значений: `aws secretsmanager list-secret-version-ids`); через `grace_hours` значение `lawbid-prod/JWT_ACTIVE_KID` стало новым; в «Здоровье системы» строка «Смена паролей и ключей» зелёная; при смене Redis через 24 ч приходит письмо «старый токен отключён». Во время смены `https://<api>/health/ready` остаётся 200.

## Сорвалась / просрочена (алерт `…-problems`)

Приложение продолжает работать на текущих секретах — смена **ничего не ломает, пока не завершена**: `AWSCURRENT` меняется только на последнем шаге.
1. Логи: CloudWatch `/aws/lambda/lawbid-prod-secret-rotation-rotator` (Redis/ключи), `/aws/lambda/lawbid-prod-db` (база), `…-ops`.
2. Частые причины: Redis ещё `modifying` (повторится сама); для базы — нет доступа функции к Secrets Manager/RDS (группа безопасности), мастер-секрет не в формате JSON.
3. Сорвавшийся шаг повторяется: `aws secretsmanager rotate-secret --secret-id …`. Зависшую версию `AWSPENDING` можно убрать: `aws secretsmanager update-secret-version-stage --secret-id … --version-stage AWSPENDING --remove-from-version-id <id>`.
4. Выключить: `redis_enabled = false` / `db_enabled = false` можно в любой момент (секреты остаются как были, просто смена по расписанию прекращается). `keys_enabled = false` после первой смены **не выключайте без разбора**: переменные `JWT_ACTIVE_KID=j1` и т. д. вернутся в task definition, а активными к тому времени уже могут быть `j2`/`k2`/`m2` (а `j1` удалён) — задачи не запустятся. Сначала приведите `*_ACTIVE_KID` в `modules/stack/main.tf` к текущим значениям секретов `lawbid-prod/*_ACTIVE_KID`.

## Убрать старый ключ (чаты, «Ключи и сервисы»)

Только когда «Здоровье системы» → «Ключи сообщений» зелёное и пишет «старые ключи … больше не нужны» (все строки перешифрованы), а для админ-хранилища нажата «Перешифровать»:
`aws lambda invoke --function-name lawbid-prod-secret-rotation-ops --payload '{"mode":"prune","secret":"MESSAGE_ENC_KEYS","kid":"m1"}' /dev/stdout`
Активный и самый новый ключ функция удалить откажется. Пока ключ не убран — ничего не потеряно, просто в списке лишняя запись.

## Стоимость (us-east-1, на 2026-10-25)

Секреты: +1 (`DB_APP_CREDENTIALS`) и +3 (`*_ACTIVE_KID`) по $0,40/мес ≈ $1,60; вызовы API Secrets Manager — центы; Lambda (≈ 800 коротких запусков в месяц) — в бесплатном лимите; 2 алерта CloudWatch ≈ $0,20; метрики ≈ $0,3–1 (15–20 пользовательских рядов по $0,30). Функция базы AWS находится в VPC, но выходит только на Secrets Manager через уже существующие endpoint'ы — NAT-трафика не добавляет. Итого ≈ $2–3 в месяц, при выключенном `secret_rotation` — $0.

## Источники (проверено 2026-10-25)

- AWS Secrets Manager, шаблоны функций ротации (RDS PostgreSQL alternating users = SecretsManagerRDSPostgreSQLRotationMultiUser; для токена ElastiCache шаблона нет, есть только для пользователей ElastiCache): https://docs.aws.amazon.com/secretsmanager/latest/userguide/reference_available-rotation-templates.html
- ElastiCache AUTH: стратегии `ROTATE` (два токена) и `SET` (один), максимум два токена, нужен TLS: https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/auth.html ; пример кастомной функции AWS: https://github.com/aws-samples/amazon-elasticache-auth-rbac-rotation
- RDS: управляемый пароль мастера в Secrets Manager (по умолчанию ротация раз в 7 дней), `RotateMasterUserPassword`: https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html
- Hosted rotation Lambda (CloudFormation, `RotationType: PostgreSQLMultiUser`, `MasterSecretArn`, `VpcSubnetIds`…): https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-secretsmanager-rotationschedule-hostedrotationlambda.html
- ECS читает секреты только при старте задачи, для нового значения нужен `forceNewDeployment`: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-secrets.html ; обзор подходов (EventBridge/перезапуск, 2026-02-12): https://oneuptime.com/blog/post/2026-02-12-access-secrets-manager-secrets-ecs-tasks/view
- JWT: сначала публикуем ключ, потом подписываем им; старый ключ держим не меньше срока жизни токена + запас (обзор Gravitee, без нормативного стандарта): https://gravitee.io/corpus/gen-1164/json-web-token/key-rotation-strategies-for-jwt.html

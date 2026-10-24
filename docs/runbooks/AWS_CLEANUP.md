# Уборка в AWS: что копится, что чистится само, что делать руками

**Для владельца.** Всё, что мы грузим в AWS (сайт, веб-приложение, сборки
сервера, логи, копии базы), копится само. Старое лежит и стоит денег. Ниже:
что копится, какое правило это убирает и через сколько, что **не удаляется
никогда**, как проверить глазами в консоли, и список разовой ручной уборки
того, что накопилось до этих правил.

Правила записаны в Terraform (`infra/`) и в сценариях выкладки
(`scripts/deploy/`). Они начинают работать после `terraform apply`
(строки «после apply» ниже) или сразу после следующей выкладки веб-приложения
(строки «сразу»).

---

## 1. Что копится и что его убирает

| Что копится | Правило | Через сколько | Когда начнёт работать |
|---|---|---|---|
| Образы сервера в ECR (`lawbid-api`, `lawbid-admin`) | Остаются **60 последних**; образы без метки удаляются | без метки: 2 дня; остальные — старше 60-го | после `apply` в `infra/bootstrap` |
| Образ ClamAV (`lawbid-clamav`) | Остаются 5 последних | сразу при следующем запуске правила | после `apply` в `infra/bootstrap` |
| Папки веб-приложения `releases/<версия>/` (внутри — `v/<версия>/` и сжатые `.br`) | Шаг «Remove old releases» в `web-deploy.yml` (скрипт `scripts/deploy/web-prune-releases.sh`) удаляет релиз, только если выполнены **все** условия: он не текущий и не «предыдущий», он не среди 30 последних, ему больше 3 дней | при каждой выкладке | сразу |
| Метки `br_<версия>` в переключателе CloudFront | Удаляются вместе со своим релизом | вместе с релизом | сразу (нужен `apply` в `infra/envs/prod` ради права `DeleteKey`) |
| Старая корневая папка `v/` веб-бакета (осталась от схемы до переключателя) | Тот же скрипт удаляет её, когда переключатель релизов уже работает | при следующей выкладке | сразу |
| Старые версии файлов в бакете веба | Удаляются через 14 дней; для `releases/` — через 1 день; «пустые» метки удаления тоже | 1–14 дней | после `apply` |
| Сайт и SEO-страницы (`seo-deploy.yml`) | Копить нечему: каждая папка заменяется целиком (`sync --delete`) | — | уже так |
| Бакет `documents` (выгрузки, документы) | `exports/` — 3 дня; `legal-exports/` — 31 день; старые версии — 90 дней; недокачанные загрузки — 7 дней | см. слева | уже было + метки удаления после `apply` |
| Копия `documents` в другом регионе | Те же 90 дней для старых версий, 7 дней для недокачанных | 90 / 7 дней | после `apply` |
| Бакет `media` (фото, аватары) | **Файлы пользователей не удаляются.** Только старые версии (30 дней), недокачанные загрузки (7 дней), «пустые» метки удаления | 30 / 7 дней | уже было + метки удаления после `apply` |
| Бакет журнала CloudTrail | Записи — 365 дней (так записано в `DEPLOY_PROD.md`), старые версии — 30 дней | 365 / 30 | уже так |
| Бакет с результатами проверки сайта (canary) | Запуски — 14 дней, недокачанное — 7 дней | 14 / 7 | после `apply` |
| Бакет состояния Terraform (`…-tfstate`) | Старые версии состояния — 90 дней (чтобы можно было откатить неудачный `apply`) | 90 дней | после `apply` в `infra/bootstrap` |
| Журналы CloudWatch сервера (`/lawbid/<env>/api, worker, admin, clamav, migrate`) | Хранятся `log_retention_days` = 30 дней | 30 | уже так |
| Журналы базы (`/aws/rds/instance/…/postgresql`, `upgrade`) | 30 дней | 30 | уже так |
| Журнал Container Insights ECS (`/aws/ecs/containerinsights/<кластер>/performance`) — AWS создаёт его сам «без срока» | Срок ставится командой AWS CLI во время `apply` | 30 | после `apply` |
| Журнал проверки сайта (`/aws/lambda/cwsyn-…`) — AWS создаёт сам «без срока» | Срок 14 дней, ставится во время `apply` | 14 | после `apply` |
| Копии базы (автоматические RDS) | `database_backup_retention_days` = 14 дней (в проде 14–35) | 14 | уже так |
| Копии AWS Backup | `retention_days` = 35 дней в основном хранилище и в резервном регионе | 35 | уже так |
| История Performance Insights базы | 7 дней — это бесплатный уровень (раньше срок не был записан явно) | 7 | после `apply` |
| Снимок Redis | хранится 1 | — | уже так |

### Что не удаляется никогда

- Файлы пользователей (бакет `media`, бакет `documents`, кроме временных выгрузок
  `exports/` и `legal-exports/`).
- Копии базы внутри срока хранения (14–35 дней), последний снимок
  `…-postgres-final` при удалении базы.
- Текущий и предыдущий релиз веб-приложения, 30 последних релизов,
  любой релиз моложе 3 дней.
- Всё, что помечено тегом `Protect=true` или `Environment=production-critical`
  (кнопки уборки такое не трогают, и у роли уборки нет на это прав).

### Что проверено и копить не может

- **Старые версии заданий ECS (task definitions)** — бесплатные, не чистим.
- **Диски и образы (AMI) серверов LiveKit и TURN.** В Terraform снимки и
  образы не делаются: система берёт свежий образ ОС из каталога AWS, у
  сервера один диск, который уходит вместе с сервером. Политика DLM не нужна.
  Если вы когда-нибудь сделаете снимок руками — он попадёт в отчёт
  «AWS inventory» (ниже).
- **Версии Lambda** — своих Lambda нет, только проверка сайта (canary),
  AWS сам хранит одну версию.
- **Журналы балансировщика и CloudFront** — не включены (в Terraform не
  заданы), копить нечему. Если включите — бакет для них создайте с правилом
  «удалять через 30–90 дней».
- **Bunny.net** (видео) — это не AWS. Чистка там делается в панели Bunny
  (Stream → библиотека → удалить неиспользуемые видео), мы её не трогаем.

---

## 2. Как проверить глазами в консоли AWS

1. **Сколько стоит и за что.** Billing and Cost Management → **Cost Explorer**
   → справа Group by → **Service** → период «последние 30 дней». Растёт строка
   S3, ECR, CloudWatch или EC2-Other (это диски и адреса) — смотрим её ниже.
2. **Размер бакета.** S3 → нажать имя бакета → вкладка **Metrics** → график
   «Total bucket size» и «Number of objects». Для веб-бакета (`…-web`) размер
   не должен расти без остановки: после уборки он идёт «пилой».
3. **Правила бакета.** S3 → бакет → вкладка **Management** → Lifecycle rules.
   Должны быть правила, названные в таблице выше.
4. **Образы ECR.** ECR → Private repositories → `lawbid-api` → список образов:
   не больше ~60 с меткой и почти нет «<untagged>». Вкладка слева
   **Lifecycle policy** показывает правило.
5. **Журналы.** CloudWatch → Logs → **Log groups** → столбец **Retention**:
   нигде не должно быть «Never expire».
6. **Всё сразу.** GitHub → Actions → **AWS inventory** → Run workflow (см. §3):
   отчёт сам отметит слова **FLAG** у всего, что выглядит ненужным.

---

## 3. Два кнопочных сценария в GitHub (Actions)

### 3.1 «AWS inventory» — посмотреть, ничего не меняет

Actions → **AWS inventory** → Run workflow. Через 5–10 минут: на странице
запуска (Summary) отчёт, он же файлом в разделе Artifacts (`aws-inventory`,
хранится 30 дней). В отчёте:

- расходы за 30 дней по службам;
- все бакеты S3 (размер, правила, теги), CloudFront;
- по каждому региону: серверы EC2, диски, Elastic IP, снимки и образы, NAT,
  балансировщики, ECS, репозитории ECR, базы RDS и их ручные снимки,
  ElastiCache, группы журналов;
- **FLAG** у: остановленных серверов, дисков без сервера, адресов без
  привязки, старых снимков, балансировщиков без здоровых целей, NAT с почти
  нулевым трафиком, баз без подключений за 7 дней, пустых или «чужих» бакетов,
  репозиториев ECR, которых не использует ни одно задание, групп журналов
  без срока, ресурсов без тегов, всего с тегом `lawbid-loadtest`, и
  запущенного **staging** (если он вам не нужен — это деньги впустую).

Регионы: в поле Regions можно написать `us-east-1,us-west-2` (основной и
регион копии документов). Пустое поле — только основной.

### 3.2 «AWS cleanup» — удаляет только безопасное

Actions → **AWS cleanup** → Run workflow.

- По умолчанию стоит галочка **dry run**: сценарий только пишет, что удалил
  бы. Сначала всегда запускайте так и читайте список.
- Чтобы удалить по-настоящему: снимите галочку и запустите ещё раз.
- Перед работой GitHub попросит **подтверждение** (как для выкладки в
  production): кнопка «Review deployments» → поставить галочку
  `aws-cleanup` → Approve.

Что удаляет: диски без сервера старше 7 дней; Elastic IP без привязки;
образы AMI и снимки старше 35 дней, которые не использует ни один сервер и
ни один шаблон запуска (копии AWS Backup и RDS пропускаются); образы ECR без
метки (кроме «детей» многоплатформенного образа); серверы и диски с тегом
`lawbid-loadtest` старше 4 часов (остальное с этим тегом — базы, балансировщики —
только перечисляется, удалять придётся самому).
**Не** трогает: базы RDS, Redis, S3, ECS, балансировщики, пользовательские
файлы, копии в пределах срока, всё с `Protect=true`.

### 3.3 Разовая настройка (один раз)

**Вариант А (рекомендуется): через Terraform.** В `infra/bootstrap`:
`terraform apply`. Появятся две роли `lawbid-prod-github-inventory` (только
чтение) и `lawbid-prod-github-cleanup` (удаление безопасного). В выводе —
`inventory_role_arn` и `cleanup_role_arn`. Дальше в GitHub:

1. Репозиторий → Settings → Secrets and variables → Actions → New repository
   secret: `AWS_INVENTORY_ROLE` = `inventory_role_arn`; `AWS_CLEANUP_ROLE` =
   `cleanup_role_arn`.
2. Settings → **Environments** → New environment → имя ровно **aws-cleanup** →
   Required reviewers → добавить себя → Save.

**Вариант Б: руками в консоли AWS**, если `apply` в bootstrap делать не
хотите. Провайдер входа GitHub у вас уже есть (его создала выкладка).

*Роль «только чтение» (инвентаризация):*
IAM → Roles → Create role → Trusted entity: **Web identity** → Identity
provider `token.actions.githubusercontent.com`, Audience `sts.amazonaws.com`,
GitHub organization = владелец репозитория, repository = имя репозитория,
branch `main` → Next → в списке политик отметить **ReadOnlyAccess** → имя
`lawbid-prod-github-inventory` → Create. Потом открыть роль → Add permissions →
Create inline policy → вкладка JSON → вставить и сохранить (стоимость):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ce:GetCostAndUsage", "ce:GetCostForecast"], "Resource": "*" }
  ]
}
```

*Роль «уборка» (только безопасное удаление):* IAM → Roles → Create role →
Custom trust policy → вставить (подставьте номер аккаунта и `ВЛАДЕЛЕЦ/РЕПО`):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringEquals": { "token.actions.githubusercontent.com:aud": "sts.amazonaws.com" },
      "StringLike":   { "token.actions.githubusercontent.com:sub": "repo:ВЛАДЕЛЕЦ/РЕПО:environment:aws-cleanup" }
    }
  }]
}
```

Next → без политик → имя `lawbid-prod-github-cleanup` → Create. Открыть
роль → Add permissions → Create inline policy → JSON (минимально нужные права;
всё, что с тегом `Protect=true`, удалить нельзя):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Sid": "Look", "Effect": "Allow", "Resource": "*",
      "Action": ["ec2:DescribeVolumes", "ec2:DescribeAddresses", "ec2:DescribeSnapshots",
        "ec2:DescribeImages", "ec2:DescribeInstances", "ec2:DescribeLaunchTemplateVersions",
        "ec2:DescribeLaunchTemplates", "ec2:DescribeTags", "ec2:DescribeRegions",
        "ecr:DescribeRepositories", "ecr:DescribeImages", "ecr:ListImages", "ecr:BatchGetImage",
        "tag:GetResources"] },
    { "Sid": "DeleteDisksIpsSnapshots", "Effect": "Allow", "Resource": "*",
      "Action": ["ec2:DeleteVolume", "ec2:ReleaseAddress", "ec2:DeleteSnapshot", "ec2:DeregisterImage"],
      "Condition": { "StringNotEquals": { "aws:ResourceTag/Protect": "true" } } },
    { "Sid": "DeleteUntaggedEcrImages", "Effect": "Allow",
      "Action": "ecr:BatchDeleteImage",
      "Resource": ["arn:aws:ecr:*:ACCOUNT_ID:repository/lawbid-api",
                   "arn:aws:ecr:*:ACCOUNT_ID:repository/lawbid-admin",
                   "arn:aws:ecr:*:ACCOUNT_ID:repository/lawbid-clamav"] },
    { "Sid": "TerminateLoadTestServers", "Effect": "Allow",
      "Action": "ec2:TerminateInstances",
      "Resource": "arn:aws:ec2:*:ACCOUNT_ID:instance/*",
      "Condition": { "StringLike": { "aws:ResourceTag/lawbid-loadtest": "*" } } }
  ]
}
```

Потом секреты и environment `aws-cleanup` — как в варианте А. Если секрет
`AWS_INVENTORY_ROLE` не задан, отчёт временно пойдёт под ролью выкладки
(`AWS_DEPLOY_ROLE_PROD`), но она видит только часть аккаунта.

---

## 4. Разовая ручная уборка того, что накопилось ДО этих правил

Порядок: сначала `terraform apply`, потом один раз запустить выкладку веба
(Actions → Web deploy → Run workflow) и «AWS inventory», потом пройти список.

**Само почистится после apply / выкладки** (руками не нужно):
образы ECR выше лимита и без метки (в течение суток после apply в bootstrap),
сроки хранения журналов, старые версии файлов во всех бакетах, недокачанные
загрузки, лишние релизы и корневая `v/` веб-бакета (после первой выкладки веба),
старые версии состояния Terraform.

**Руками (если хотите убрать сразу, а не ждать):**

1. **Старые папки веб-приложения.** S3 → бакет `…-web` → папка `releases/` →
   отметить все папки, кроме текущей (её номер: GitHub → Actions → последний
   успешный Web deploy → строка «Live web release: …») и предыдущей → Delete →
   ввести `permanently delete` → Delete objects. Папку `v/` в корне бакета
   можно удалить целиком (в ней ничего не используется, если выкладка с
   переключателем уже работает). Папки `lawyers/`, `attorneys/`,
   `practice-areas/`, `_next/`, `.well-known/`, файлы `sitemap.xml`,
   `robots.txt`, `public-paths.txt` и страницы сайта **не трогать**.
   Внимание: удалять релизы моложе 3 дней не стоит — открытые вкладки у
   пользователей ещё просят их файлы.
2. **Старые образы ECR.** ECR → Private repositories → `lawbid-api` → отметить
   образы, кроме 60 самых новых → Delete → подтвердить. То же для
   `lawbid-admin`. Образ, который сейчас запущен (метка = номер выкладки),
   и версии для отката не удалять. Проще: подождать сутки после apply.
3. **Лишние диски.** EC2 → Elastic Block Store → **Volumes** → фильтр
   State = **Available** → такие диски не подключены ни к одному серверу.
   Для каждого: Actions → Delete volume (если не уверены — сначала
   Actions → Create snapshot). Либо запустите «AWS cleanup» в режиме dry run.
4. **Адреса без привязки.** EC2 → Network & Security → **Elastic IPs** →
   у кого пустое поле «Associated instance ID» → Actions → Release Elastic
   IP addresses (каждый стоит около $3.6 в месяц).
5. **Снимки и образы.** EC2 → **Snapshots** (Owned by me) и **AMIs**. Копии
   «AWS Backup» и «rds:» не трогать. Образы AMI и снимки старше 35 дней,
   которые вы не узнаёте: Actions → Deregister AMI, затем Delete snapshot.
6. **Ручные снимки базы.** RDS → **Snapshots** → вкладка Manual → снимки,
   которые не нужны (кроме `…-postgres-final`): Actions → Delete snapshot.
   Автоматические снимки удаляются сами, их не трогать.
7. **Остановленные серверы и staging.** EC2 → Instances → фильтр State =
   stopped: если не нужен — Instance state → **Terminate**. Если у вас есть
   staging (в отчёте FLAG «staging»), а он не нужен: в `infra/envs/staging`
   выполнить `terraform destroy` (деньги экономит заметно; перед этим
   убедиться, что там нет нужных данных).
8. **Ресурсы нагрузочных тестов.** Запустите «AWS inventory»: раздел
   «Resources tagged lawbid-loadtest». Серверы и диски уберёт «AWS cleanup»;
   базы и балансировщики с этим тегом удалить в консоли руками.
9. **Группы журналов без срока.** CloudWatch → Log groups → отсортировать по
   Retention → у всех «Never expire»: Actions → Edit retention setting →
   30 days. (Группы `/aws/ecs/containerinsights/…` и `/aws/lambda/cwsyn-…`
   после `apply` получат срок сами.)
10. **Пустые и забытые бакеты.** S3 → бакеты, которые не называются
    `lawbid-…`, или пустые (в отчёте FLAG empty / foreign): выбрать → **Empty**
    → **Delete**. Бакеты `lawbid-…-media`, `-documents`, `-documents-replica`,
    `-cloudtrail`, `-tfstate`, `-web` не удалять.

---

## 5. Чего мы проверить не смогли (нужен доступ к AWS)

Эти строки писались «по коду», без входа в аккаунт: поэтому после первого
`apply` стоит один раз открыть консоль и сверить §2 (особенно «Retention» у
групп журналов и Lifecycle у бакетов) и запустить «AWS inventory».
Если во время `apply` команда AWS CLI для журналов ECS / canary не
сработает, `apply` не остановится, а выведет предупреждение: тогда срок
для этих двух групп ставится руками (CloudWatch → Log groups → Actions →
Edit retention setting).

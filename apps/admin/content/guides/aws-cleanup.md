---
id: aws-cleanup
title: Уборка в AWS: что копится, что чистится само, две кнопки в GitHub
category: money
cost: Бесплатно. Экономит деньги: каждый забытый адрес ≈ $3,6 в месяц, диски и старые копии - по объёму
time: Разовая настройка 20 минут. Отчёт «AWS inventory» 5-10 минут ожидания. Раз в месяц 10 минут на просмотр
runbook: AWS_CLEANUP.md
verified: 2026-10-27
sources:
  - Репозиторий: docs/runbooks/AWS_CLEANUP.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/AWS_CLEANUP.md
  - Amazon S3: правила жизненного цикла | https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html
  - Amazon ECR: политики очистки образов | https://docs.aws.amazon.com/AmazonECR/latest/userguide/LifecyclePolicies.html
  - GitHub Actions: окружения и подтверждение запуска | https://docs.github.com/en/actions/deployment/targeting-different-environments/managing-environments-for-deployment
---

## Что это и зачем

Всё, что мы грузим в AWS (сборки сервера, версии сайта, журналы, копии базы), копится само. Старое лежит и стоит денег. Почти всё теперь убирается правилами: сборки сервера - остаются 60 последних; старые версии веб-приложения - через 3 дня, если их больше 30; журналы - 30 дней; копии базы - 14-35 дней; старые версии файлов в хранилищах - 14-90 дней. Правила начинают работать после «ставь на AWS» и следующей выкладки веба.

**Никогда не удаляются:** файлы пользователей (фото, документы), копии базы внутри срока, текущий и предыдущий релиз веба, всё с меткой `Protect=true`.

Для остального есть две кнопки в GitHub: **AWS inventory** (отчёт, ничего не меняет) и **AWS cleanup** (удаляет только безопасное).

## Что понадобится

- Доступ к репозиторию GitHub (вкладка **Actions**, настройки).
- Для разовой настройки: Mac с Terraform и входом в AWS, папка `infra/bootstrap`.
- Консоль AWS для ручной уборки старого.

## Шаги

**Разовая настройка (один раз)**

1. В `infra/bootstrap` выполните `terraform apply`. Появятся две роли: `lawbid-prod-github-inventory` (только чтение) и `lawbid-prod-github-cleanup`. В выводе будут `inventory_role_arn` и `cleanup_role_arn`.
2. GitHub → репозиторий → **Settings → Secrets and variables → Actions → New repository secret**: `AWS_INVENTORY_ROLE` и `AWS_CLEANUP_ROLE` с этими значениями.
3. **Settings → Environments → New environment**, имя ровно `aws-cleanup` → **Required reviewers** → добавьте себя → **Save**. Это ваша собственная кнопка подтверждения перед удалением, второй человек не нужен.

**Отчёт: посмотреть, ничего не меняя**

4. **Actions → AWS inventory → Run workflow**. В поле Regions можно написать `us-east-1,us-west-2`. Через 5-10 минут на странице запуска (Summary) отчёт: расходы за 30 дней по службам, все хранилища, серверы, диски, адреса, копии, журналы. Слово **FLAG** стоит у всего, что выглядит ненужным: остановленные серверы, диски без сервера, адреса без привязки, журналы без срока, запущенный staging.

**Уборка: удалить безопасное**

5. **Actions → AWS cleanup → Run workflow** с галочкой **dry run** (стоит по умолчанию): сценарий только напишет, что удалил бы. Прочитайте список.
6. Снимите галочку и запустите снова. GitHub попросит подтверждение: **Review deployments** → галочка `aws-cleanup` → **Approve**.
7. Что удаляет: диски без сервера старше 7 дней, адреса без привязки, образы и снимки старше 35 дней, которые никто не использует, сборки без метки, серверы нагрузочных тестов старше 4 часов. Не трогает базы, Redis, хранилища, серверы приложения, копии в сроке, всё с `Protect=true`.

**Разовая ручная уборка старого (по желанию)**

8. Сначала «ставь на AWS», одна выкладка веба и «AWS inventory». Большинство почистится само за сутки.
9. Руками в консоли, если не хотите ждать: S3 → корзина `…-web` → `releases/` → удалить папки старше 3 дней, кроме текущей и предыдущей (номер текущей - в последнем Web deploy, строка «Live web release»); папки сайта (`lawyers/`, `attorneys/`, `practice-areas/`, `_next/`, `.well-known/`, `sitemap.xml`, `robots.txt`) не трогать. EC2 → **Volumes** с State = Available → удалить. EC2 → **Elastic IPs** без привязки → **Release**. RDS → **Snapshots → Manual** → ненужные удалить (кроме `…-postgres-final`). CloudWatch → **Log groups** → у всех «Never expire» поставить 30 days. Остановленные серверы и ненужный staging - удалить (staging: `terraform destroy` в `infra/envs/staging`, предварительно убедиться, что данных там нет).

## Как проверить

- В отчёте «AWS inventory» нет слов **FLAG** (или только те, что вы осознанно оставили).
- Консоль AWS → **Cost Explorer** → Group by **Service**, 30 дней: строки S3, ECR, CloudWatch, EC2-Other не растут без остановки.
- S3 → корзина `…-web` → **Metrics**: размер идёт «пилой», а не вверх.
- CloudWatch → Log groups → столбец **Retention**: нигде нет «Never expire».
- В админке **Расходы** через месяц сумма AWS ниже.

## Частые ошибки

- Удалили релиз веба моложе 3 дней: у пользователей с открытыми вкладками перестанут грузиться файлы. Ждите 3 дня.
- Удалили копии «AWS Backup» или снимки `rds:` - это резервные копии базы. Кнопка их пропускает; руками не трогать.
- Запустили cleanup без dry run первым: всегда сначала читайте список.
- Если во время apply команда для журналов ECS / canary не сработала, apply не остановится, а выведет предупреждение: тогда срок для этих двух групп поставьте руками (CloudWatch → Log groups → **Edit retention setting**).
- Bunny (видео) - не AWS; там чистка в панели Bunny.

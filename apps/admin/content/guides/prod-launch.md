---
id: prod-launch
title: Первый запуск на AWS: порядок шагов владельца
category: launch
cost: AWS около $150 в месяц на старте (из launch.tfvars.example), растёт с нагрузкой до потолков; база данных отдельно, по выбранному хостингу
time: 1-2 дня с ожиданиями DNS и сертификата (оценка); ваших рук около 2 часов
runbook: PROD_LAUNCH.md
verified: 2026-10-27
sources:
  - Репозиторий: docs/runbooks/PROD_LAUNCH.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/PROD_LAUNCH.md
  - AWS: Configuring settings for the AWS CLI | https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html
  - AWS: DNS validation for ACM certificates | https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html
  - GitHub Docs: Managing environments for deployment | https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment
  - Stripe: Webhooks | https://docs.stripe.com/webhooks
---

## Что это и зачем

Это порядок самого первого запуска LawBid на серверах Amazon (AWS). Почти всё делает Claude с вашего Mac, а вам остаются шаги, где нужны ваши руки: войти в аккаунты, вставить записи DNS, ввести пароли. Ключи и пароли никогда не пишутся в чат — только в Терминал или в админку.

Что создаётся: сеть, защищённый вход (балансировщик HTTPS с защитой от атак), сервера приложения (API, фоновый обработчик с антивирусом, админка), быстрая память Redis, хранилища файлов, хранилище секретов, почтовый домен, тревоги на почту, бюджет. База данных PostgreSQL 16 создаётся отдельно у выбранного вами хостинга.

Как только всё включено, порядок проверяется огоньками на странице **Система → Запуск** в админке: каждая строка там — один из пунктов ниже.

## Что понадобится

- Mac с установленными инструментами (ставит Claude) и свежим проектом.
- Вход в аккаунт AWS, в Namecheap (домен lawbid.dev), в GitHub, в кабинеты Stripe и Bunny.
- Решение по хостингу базы данных (шаг 4).
- Телефон с приложением-аутентификатором для 2FA админки.

## Шаги

1. **Вход в AWS с Mac.** В Терминале наберите `aws login`, в открывшемся браузере войдите в аккаунт AWS компании и нажмите «Allow». Регион `us-east-1`. Если команды `aws login` нет, создайте ключ доступа: Консоль AWS → **IAM → Users → Create user** → **Attach policies directly → AdministratorAccess** → в пользователе **Security credentials → Create access key → Command Line Interface (CLI)**, затем `aws configure` в Терминале. Claude проверит вход командой `aws sts get-caller-identity`.
2. **Подготовка аккаунта** (Claude): хранилище состояния, репозитории образов, сертификат HTTPS, роль для GitHub. Вы ничего не делаете.
3. **DNS, часть 1: сертификат.** Namecheap → **Domain List → lawbid.dev → Manage → Advanced DNS → Add New Record**. Для каждой записи, которую назовёт Claude: Type `CNAME Record`, Host — имя без хвоста `.lawbid.dev.`, Value — целиком (оканчивается на `.acm-validations.aws.`), TTL Automatic.
4. **База данных.** Выберите хостинг PostgreSQL 16 в регионе `us-east-1`: AWS RDS (рядом со всем, бэкапы из коробки), Neon или Supabase (проще и дешевле на старте). Требования: обязательное шифрование соединения (TLS), автоматические бэкапы с восстановлением на любую минуту и хранением не меньше 30 дней. Создайте базу `lawbid_prod` и пользователя `lawbid_migrator` с паролем, скопируйте строку подключения. **В чат её не присылайте** — её спросит скрипт на шаге 6.
5. **Образы и секреты** (Claude). Три незаменимых ключа копируются в «Связку ключей» вашего Mac под именами «LawBid prod …». Их потеря означает нечитаемые чаты, так что не удаляйте эти записи.
6. **База: одна команда.** В Терминале в папке проекта: `scripts/deploy/prod-db-setup.sh`. Вставьте строку подключения из шага 4 (при вставке она не видна) и нажмите Enter.
7. **Полный запуск и данные** (Claude): спросит e-mail супер-админа.
8. **Пароль админки: одна команда.** `scripts/deploy/prod-run.sh TAG admin` (вместо TAG — тег выката, его назовёт Claude). Введите e-mail из шага 7, логин и пароль (пароль не виден при вводе).
9. **DNS, часть 2.** Namecheap → Advanced DNS → Add New Record: `CNAME` для `api` и `admin` на адрес балансировщика; три `CNAME` для подписи почты (DKIM); `MX`/`TXT` для почты и `TXT` для `_dmarc` — все значения назовёт Claude. Затем в почте откройте письмо «AWS Notification - Subscription Confirmation» и нажмите **Confirm subscription**, иначе тревоги не придут.
10. **Админка прода.** Откройте `https://admin.lawbid.dev`, войдите логином из шага 8, включите 2FA. В **Безопасность → Ключи и сервисы** вставьте боевые ключи (Twilio, Firebase, Bunny, Stripe LIVE, секреты вебхуков). В **Система → Функции** включите нужные флаги. Вебхуки: Stripe → **Developers → Webhooks → Add endpoint** с адресом `https://api.lawbid.dev/api/v1/webhooks/stripe` (и для Connect `.../webhooks/stripe/connect`), секрет `whsec_…` вставьте в админку; Bunny → Stream → библиотека → **Webhook URL** `https://api.lawbid.dev/api/v1/webhooks/bunny/<токен из админки>`.
11. **Автовыкладка из GitHub.** GitHub → **Settings → Secrets and variables → Actions**: секреты `AWS_DEPLOY_ROLE_PROD`, `AWS_REGION` = `us-east-1`, `ECR_REGISTRY`, `PROD_API_URL` = `https://api.lawbid.dev`, `PROD_ADMIN_URL` = `https://admin.lawbid.dev` (значения назовёт Claude); переменная `DEPLOY_ENABLED` = `true`. **Settings → Environments → New environment** `production` → **Required reviewers**: вы. С этого момента каждое слияние в `main` собирает версию и после вашего подтверждения одной кнопкой выкатывает её; откат — **Actions → Rollback production**.

## Как проверить

- **Система → Запуск**: строки про выкладку (Deploy), DNS, бюджет, Twilio, Stripe и остальные загораются зелёным по мере выполнения. Цель — вся страница зелёная.
- **Система → Здоровье системы**: все проверки зелёные, `https://api.lawbid.dev` отвечает.
- Пришло письмо подтверждения тревог и вы нажали **Confirm subscription**.
- Почта: пока AWS не выпустил аккаунт из «песочницы», письма уходят только на адреса, подтверждённые в SES (Консоль → SES → **Identities → Create identity → Email address**). Вход в админку по паролю работает и без писем. После одобрения AWS письма пойдут всем сами.

## Частые ошибки

- Шаг `configure-aws-credentials` пишет «Not authorized to perform sts:AssumeRoleWithWebIdentity»: секрет `AWS_DEPLOY_ROLE_PROD` не совпадает с ролью из подготовки аккаунта. Claude сверит по шагу «Show the OIDC claims» в логе Deploy.
- Строка подключения к базе без TLS: приложение не стартует на проде. Хостинг должен давать защищённое соединение.
- Повторный `terraform apply` откатил версию: в настройках стоял тег первого запуска. Перед `apply` Claude ставит текущий тег из последнего Deploy.
- Тревоги не приходят: не подтверждена подписка в письме AWS (шаг 9).
- Записи DNS с лишним хвостом `.lawbid.dev.` в Host — самая частая причина «висящего» сертификата.

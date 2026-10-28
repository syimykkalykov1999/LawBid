---
id: web-launch
title: Запуск веб-версии приложения на lawbid.dev
category: launch
cost: Бесплатно за сами шаги; хостинг страниц (S3 + CloudFront) при старте считанные доллары в месяц (оценка)
time: 2-3 часа с ожиданием сертификата и DNS (оценка), разбито на несколько заходов
runbook: WEB_LAUNCH.md
verified: 2026-10-27
sources:
  - Репозиторий: docs/runbooks/WEB_LAUNCH.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/WEB_LAUNCH.md
  - Firebase: Set up a JavaScript Firebase Cloud Messaging client app | https://firebase.google.com/docs/cloud-messaging/js/client
  - AWS: DNS validation for ACM certificates | https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html
  - GitHub Docs: Using secrets in GitHub Actions | https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions
---

## Что это и зачем

Веб-версия — это то же приложение LawBid, собранное для браузера. Код уже в репозитории: боковое меню, страницы адвокатов по адресам вида `/lawyer/anna`, скачивание файлов, уведомления в браузере, публичные страницы для поисковиков (практика × штат) и сайт компании (/about, цены, правовые страницы). Но ничего не опубликовано: в AWS ещё не создан хостинг, домен lawbid.dev никуда не указывает. Эта инструкция — список того, что сделать владельцу, чтобы сайт открылся.

Терминами: «хостинг» — хранилище файлов сайта в AWS (S3) плюс быстрая раздача по всему миру (CloudFront); «сертификат» — подтверждение, что сайт настоящий (замочек в браузере), его бесплатно выдаёт AWS; «DNS» — записи у регистратора домена (Namecheap), которые говорят, куда вести адрес.

## Что понадобится

- Доступ в Firebase console (проект приложения), в Namecheap (домен lawbid.dev), в GitHub (репозиторий) и в AWS с Mac.
- Claude рядом: команды Terraform выполняет он, вы вставляете записи DNS и ключи.
- Телефон для финальной проверки звонков и голосовых.

## Шаги

1. **Уведомления в браузере (Firebase).** Firebase console → проект LawBid → **Add app → Web**. Затем **Project settings → Cloud Messaging → Web Push certificates → Generate key pair**. Полученные значения (`apiKey`, `appId`, `messagingSenderId`, `projectId`, `authDomain` и ключ VAPID) положите в секреты репозитория с именами `FIREBASE_WEB_*` (GitHub → **Settings → Secrets and variables → Actions**). Без них сайт работает, просто без уведомлений в браузере.
2. **Сертификат.** Claude добавляет в настройки Terraform `web_host = "lawbid.dev"`, `web_extra_hosts = ["www.lawbid.dev"]`, `web_create_certificate = true` и запрашивает сертификат. Он выдаст вам одну-две записи для подтверждения.
3. **DNS, часть 1.** Namecheap → **Domain List → lawbid.dev → Advanced DNS → Add new record**: для каждой записи тип `CNAME Record`, *Host* — имя без хвоста `.lawbid.dev.` (Namecheap добавляет домен сам), *Value* — значение из вывода, TTL Automatic. Сертификат подтвердится сам за 5-30 минут.
4. **Хостинг.** Claude делает полный `terraform apply`: создаются хранилище, CloudFront и права на публикацию. В конце он назовёт адрес вида `dxxxx.cloudfront.net`.
5. **DNS, часть 2.** Namecheap → Advanced DNS: сначала удалите стандартные записи «парковочной страницы» для `@` и `www`. Затем добавьте `ALIAS Record`, Host `@`, Value — адрес CloudFront; и `CNAME Record`, Host `www`, то же значение. Покупать TLS не нужно, он уже на стороне CloudFront.
6. **Секреты публикации.** В GitHub → **Settings → Secrets and variables → Actions**: переменная `WEB_DEPLOY_ENABLED=true`; секреты `WEB_BUCKET`, `WEB_DISTRIBUTION_ID` (значения назовёт Claude из вывода Terraform), `WEB_API_BASE_URL` = `https://api.lawbid.dev/api/v1`, `WEB_DEEP_LINK_HOST` = `lawbid.dev`, `WEB_SITE_URL`, `WEB_SEO_API_URL`. Роли деплоя Claude выдаст права публикации.
7. **Разрешить сайту обращаться к API.** Claude добавляет адрес сайта в разрешённые источники API (`S3_CORS_ALLOWED_ORIGINS` и список origin у API). Без этого сайт откроется, но не сможет войти.
8. **Поисковики.** После первой публикации добавьте сайт в Google Search Console и отправьте `https://lawbid.dev/sitemap.xml`. По умолчанию индексируются только страницы, где есть адвокаты, и штаты с высоким спросом; остальное скрыто, чтобы не плодить пустые страницы. Хотите всё — запустите workflow `SEO pages` с галочкой *index_empty*.
9. **Проверка на телефоне.** На настоящем телефоне откройте сайт: голосовое сообщение должно быть слышно, в аудио- и видеозвонке обе стороны должны слышать друг друга. На эмуляторе это проверить нельзя.
10. После этого — сборки для магазинов приложений, как договаривались.

## Как проверить

- `https://lawbid.dev` и `https://www.lawbid.dev` открываются с замочком, показывают приложение; `https://lawbid.dev/about` — сайт компании.
- В GitHub → Actions запуск `web-deploy` зелёный.
- В админке на **Система → Запуск** пункты про DNS и Cloudflare не краснеют; на **Система → Здоровье системы** всё зелёное.
- Вход на сайте работает (значит, разрешения API добавлены).

## Частые ошибки

- Сертификат «висит» дольше часа: в записи CNAME остался хвост `.lawbid.dev.` в Host или лишняя точка в Value. Исправьте запись.
- Сайт открывается, но вход не работает: шаг 7 (разрешённые источники API) не сделан.
- Нет уведомлений в браузере: не заданы секреты `FIREBASE_WEB_*` — это не ошибка, а выключенная функция.
- Старая «парковочная» страница Namecheap всё ещё видна: не удалены стандартные записи для `@` и `www`, или DNS ещё не обновился (до нескольких часов).
- Платежи на сайте открывают те же страницы Stripe, что и в приложении, только когда включён флаг приложения. Это не поломка.

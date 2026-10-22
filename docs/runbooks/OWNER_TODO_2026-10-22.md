# Список дел для владельца — 22 октября 2026 (утро)

Всё ниже могу сделать только вы: ключи, деньги, аккаунты, консоль AWS.
Порядок — по важности. Разделы A–C нужны до выкладки на прод, остальное можно позже.

## A. Решения (ответьте «1 да / 2 нет» и т.п.)

1. **Гости без регистрации.** Пускать ли смотреть ленту и анкеты адвокатов без входа (как Instagram показывает профили)? Сейчас — только после входа.
2. **Фиксированная цена, которую платит адвокат.** Запретить ли адвокату предлагать «я заплачу фиксированную сумму» (риск обхода комиссии)? Сейчас разрешено.
3. **Сборки на телефоны.** Скажите «делай сборки» — тогда соберу прод-версии на ваш Samsung и iPhone и удалю старые. Без вашего слова не делаю.

## B. Stripe (деньги) — ~15 минут

4. **Вебхук.** Stripe → Developers → Webhooks → наш endpoint → «Add events» → добавить
   `customer.subscription.pending_update_applied`, `customer.subscription.pending_update_expired`,
   `payment_intent.succeeded`. Без них докупка мест ассистента и оплата на нашей странице не подтверждаются.
5. **Apple Pay / Google Pay на нашей странице оплаты.** Stripe → Settings → Payment methods → Payment method domains → добавить `lawbid.dev` (и домен веб-приложения, если другой). Stripe даст файл `apple-developer-merchantid-domain-association` — пришлите его мне, я положу в `/.well-known/`.

## C. AWS / Terraform — ~30 минут, делаем вместе

6. **`terraform apply` в `infra/envs/prod`** (один раз, после слияния всех веток): WAF-правило размера тела, Multi-AZ + бэкапы в другой регион + VPC endpoints, CloudFront KV + функция для web, `ADMIN_CONNECT_SRC`, CSP сайта, алармы SLO и canary. Я подготовлю `plan`, вы смотрите и говорите «apply».
7. **RDS → Modify → Multi-AZ** в консоли AWS (Terraform не переключает это на живой базе). Инструкция: `docs/runbooks/DEPLOY_PROD.md`, раздел «Надёжность».
8. **Права для проверки фото (Rekognition).** В IAM-роли задач ECS добавить `rekognition:DetectModerationLabels` (войдёт в apply из п. 6). В админке: Интеграции → «Image moderation (AWS Rekognition)» → регион = регион бакета медиа. Цена ≈ $1 за 1 000 картинок.
9. **Деплой API и worker одновременно** (новый адаптер сокетов и очереди требуют одной версии на обоих).
10. **Прогон восстановления из бэкапа** раз в квартал: `scripts/ops/restore-drill.sh` (инструкция `docs/runbooks/restore-drill.md`). Первый — после п. 7.

## D. Ключи и аккаунты

11. **Bunny Read-Only API key** → Админка → Интеграции → Bunny (для подписи ссылок на видео).
12. **Google Translate ключ** для юридических документов на 10 языках: `GOOGLE_TRANSLATE_API_KEY=… npm run legal:translate` (≈ $12 один раз). Переводы лягут черновиками на проверку.
13. **Sentry:** `SENTRY_AUTH_TOKEN` и `SENTRY_ORG` на Mac и в секретах GitHub (чтобы падения приложения показывали строки кода).
14. **Firebase:** Google Cloud → Credentials → ограничить ключ Android/iOS по пакету и SHA; включить App Check (Play Integrity / DeviceCheck). Шаги в `docs/SECURITY_TODO.md`.
15. **PhotoDNA (Microsoft)** — подать заявку на https://www.microsoft.com/en-us/photodna (проверка компании, недели). Ключ → Админка → Интеграции.
16. **NCMEC** — зарегистрироваться как Electronic Service Provider на https://report.cybertip.org/. До этого найденные случаи помечаются «подать вручную» — подавайте на том же сайте.

## E. Xcode (iPhone) — ~20 минут, вместе

17. **Notification Service Extension** для пушей с аватаром и именем отправителя на iPhone: Xcode → Runner → File → New → Target → Notification Service Extension. Инструкция: `docs/runbooks/IOS_CHAT_NOTIFICATIONS.md`. Нужен ваш Apple-аккаунт в Xcode.

## F. Админка

18. **Вход в админку теперь: логин + пароль + код из приложения-аутентификатора.** При первом входе админка попросит подключить аутентификатор и покажет коды восстановления — сохраните их. Шаги по-русски: `docs/runbooks/OWNER.md`, раздел «Вход в админку».
19. После запуска: Админка → Лимиты → `min_daily_signups` (минимум регистраций в день для аларма); проверить дневные бюджеты (перевод, SMS, видео, модерация фото).
20. Canary (проверка, что сервер жив, раз в 5 минут) стоит ≈ $10/мес. Если дорого — `uptime_canary_enabled = false` в tfvars.

## G. Mac

21. **`npm ci` в папке `~/Desktop/LawBid`** — там сломаны node_modules (пустые пакеты). Запущу сам, когда скажете (≈ 5 минут, удаляет и ставит заново только node_modules).

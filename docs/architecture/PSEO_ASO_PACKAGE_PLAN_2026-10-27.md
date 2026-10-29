# План: SEO / ASO / видимость в AI — пакет «Продвижение» (2026-10-27)

Только исследование и проект. Код, git, npm и сборки не трогались. Для владельца: простыми словами, названия экранов и кнопок — по-английски. Техническая часть — в приложении А в конце.

Что нужно знать за минуту:
- Половина уже есть: статические страницы адвокатов и «практика × штат», sitemap, robots, файлы для открытия ссылок в приложении. Строим поверх, не с нуля.
- Главный риск — не техника, а качество. Google прямо наказывает «много страниц ради ранжирования без пользы» (scaled content abuse). Поэтому страница без реального содержания получает noindex и не попадает в sitemap.
- Всё выключено по умолчанию, включается в админке на странице «Продвижение» (Promotion). Страницы строятся заранее и лежат в S3/CloudFront. API и база при заходе посетителя не нагружаются.
- Для адвокатов из Нью-Йорка есть жёсткие правила рекламы (NY Rules of Professional Conduct 7.1). Страницы не должны обещать результат и называть «лучшим» без доказательств. Раздел 6.

---

## 1. Что уже есть (проверено в коде)

| Что | Где | Как сейчас |
|---|---|---|
| Генератор статических страниц | `scripts/seo/build.mjs:1-30` | Страницы `/lawyers/`, `/lawyers/<штат>/`, `/lawyers/<штат>/<практика>/`, `/practice-areas/<практика>/`, `/attorneys/<username>/` |
| Данные для страниц | `scripts/seo/build.mjs:55-70`, `scripts/seo/data/{practices,states,high_demand}.json` | Берёт верифицированных адвокатов из публичного API постранично |
| Защита от пустых страниц | `scripts/seo/build.mjs:25`, `:220` | Пустая «штат × практика» вне топ-штатов получает `noindex,follow` и не идёт в sitemap. Уже правильная идея |
| Разметка | `scripts/seo/build.mjs:101-125` | canonical, og:*, twitter:card, JSON-LD: BreadcrumbList, FAQPage (для практик), Attorney (профиль) |
| Sitemap и robots | `scripts/seo/build.mjs:276-280` | Один `sitemap.xml`, `lastmod` = дата сборки у всех. robots: только `Allow: /` и ссылка на sitemap |
| Объединение с сайтом компании | `scripts/seo/merge-site.mjs:12`, `:65-90` | Одна sitemap на два набора адресов |
| Ночная публикация | `.github/workflows/seo-deploy.yml:15-20`, `:104-155` | Cron 04:17 UTC, только если `WEB_DEPLOY_ENABLED=true`; `aws s3 sync` + инвалидация `/*` (это 1 путь) |
| Публичный каталог | `apps/api/src/modules/public-directory/public-directory.controller.ts:14-45` | `/public/directory/attorneys`, кэш 1 час, лимит 30 запросов/мин |
| Фильтр каталога | `public-directory.service.ts:109-125`, `:174` | Только `verified`, пользователь `active` и не удалён, лицензия `verified`. Настройки приватности учитывает только фото (`privacy_settings.photo_from`) |
| CloudFront-функции | `infra/modules/web/main.tf:344-360` (`seo-index`), `:446-465` (`app-noindex`) | Публичные префиксы получают `index.html` и настоящий 404; экраны приложения получают `x-robots-tag: noindex`. Класс цен `PriceClass_100` (`:474`) |
| Открытие ссылок в приложении | `scripts/seo/well-known.mjs:6-48`, `docs/deeplinks/README.md` | AASA и `assetlinks.json` генерируются; пути `/r /case /lawyer /post /u /q /g /c /auth/email-code` |
| iOS | `apps/mobile/ios/Runner/Runner.entitlements:7-9`, `Info.plist:99-102` | `applinks:$(DEEP_LINK_HOST)`; `NSUserActivityTypes` содержит только `INSendMessageIntent` (для пушей). Spotlight нет |
| Android | `apps/mobile/android/app/src/main/AndroidManifest.xml:115-128` | `autoVerify`, те же префиксы |
| Приложение | `apps/mobile/lib/core/deeplinks/deep_link_routes.dart:20-60` | Маршруты `/lawyer/:username`, `/post/:id`, `/u/:username` |
| Админка | `apps/admin/src/app/(app)/growth-plan/page.tsx`, `flags/page.tsx`, `launch/page.tsx` | Страницы «Продвижение» нет. Есть `FeatureFlag` (`schema.prisma:1250`) и `AppConfig` |
| Очереди | `apps/api/src/common/queues/queue-hardening.ts`, `apps/api/src/jobs/jobs.runner.ts` | BullMQ уже в проекте |

Что отсутствует: `llms.txt`, markdown-зеркала, страницы постов и города (только штат), страницы reel, сегментированный sitemap, правила для AI-ботов, IndexNow, явное согласие адвоката «показывать меня в интернете», готовые OG-картинки, любая работа со Spotlight, страница «Продвижение».

Найденные проблемы в существующем:
1. `aggregateRating` у адвоката (`build.mjs` блок Attorney): Google не показывает звёзды для «самооценки» бизнеса, а отзывы по NY 7.1 — отдельная тема. Убрать из JSON-LD, пока нет отзывов на самой странице.
2. `lastmod` у всех = дата сборки. Google такой сигнал игнорирует. Нужна реальная дата изменения.
3. Профили индексируются безусловно. Нет проверки «есть ли что показать» (био, практики, штат) и нет согласия адвоката.
4. Пути `/attorneys/*`, `/lawyers/*` не в AASA: ссылка из Google на телефоне откроет сайт, а не приложение. Это решение владельца (вопрос 3).
5. Инвалидация `/*` каждую ночь сбрасывает кэш и страниц, и приложения. Для 100k страниц лучше точечно (раздел 2.4).

---

## 2. Архитектура

### 2.1 Типы страниц и адреса

Принцип: страница есть только если на ней есть реальное содержание. Адреса стабильные, строчными буквами, со слэшем на конце (как сейчас).

| Тип | Адрес | Что на странице (минимум для index) |
|---|---|---|
| Hub «Lawyers» | `/lawyers/` | Список штатов и практик |
| Штат | `/lawyers/<state>/` | Практики, число адвокатов, FAQ штата |
| Город (NY сначала) | `/lawyers/new-york/<city>/` | Только если в городе ≥ 3 адвокатов с согласием; иначе noindex |
| Практика × штат/город | `/lawyers/<state>/[<city>/]<practice>/` | ≥ 3 адвоката ИЛИ уникальный местный текст (суды, сроки, правила штата), проверенный редактором |
| Практика (гид) | `/practice-areas/<practice>/` | Статья + FAQ |
| Адвокат | `/attorneys/<username>/` | Согласие + био ≥ 150 символов + ≥ 1 практика + ≥ 1 проверенная лицензия |
| Пост / Reel | `/posts/<id>/`, `/reels/<id>/` | Только публичный пост адвоката с согласием, с текстом ≥ 300 знаков или транскриптом; иначе noindex |
| Статья/Q&A | `/guides/<slug>/` (потом) | Текст от людей/редактора |

Уже существующий префикс `/post/<id>` — это ссылка в приложение. Для веб-страницы берём отдельный `/posts/<id>/`, чтобы не смешивать с AASA.

Как делают большие: Avvo — `avvo.com/{практика}-lawyer/{место}.html`, профиль с номером (по описанию в обзорах скраперов, [Apify Avvo](https://apify.com/ahmed_jasarevic/avvo-scraper)); Justia/FindLaw — иерархия штат → город → практика. Общий вывод: хаб штата → хаб города → практика × город → профиль, с перелинковкой вверх (хлебные крошки) и «соседние практики/города». Мы уже так делаем. Мои выводы по ним неполные: первичные источники не открывались, структуру точно надо подтвердить по их sitemap.

### 2.2 Генератор (без нагрузки на API при заходах)

Поток: событие или ночь → задача BullMQ → снимок данных → отрисовка → S3 → точечный сброс кэша.

1. Ночной снимок (Nightly snapshot): задача читает реплику БД один раз и пишет `seo-snapshot/YYYY-MM-DD.ndjson.gz` в S3. Это тот же принцип, что «admin stats snapshot»: тяжёлых живых запросов нет.
2. Событие при публикации (on-publish): адвокат включил согласие, поменял био, пост опубликован/удалён → в очередь `seo-render` кладётся ключ страницы (дедупликация по ключу, окно 60 с).
3. Рендер: чистая функция «данные → HTML + markdown + JSON-LD + OG-картинка». Без обращения к API/БД: только из снимка/события. Хеш содержимого сравнивается с прошлым: не изменилось — ничего не пишем (экономит PUT и сбросы).
4. Выкладка: PUT в S3 только изменившихся файлов, `Cache-Control: public, max-age=3600, s-maxage=86400`, `stale-while-revalidate`.
5. Сброс кэша CloudFront: см. 2.4.
6. Удаление: адвокат убрал согласие или удалил аккаунт → страница в S3 удаляется сразу, в течение минут; ответ 404/410, из sitemap уходит при следующей сборке; в Google отправляется запрос на удаление (инструмент Removals в Search Console — шаг владельца) и IndexNow-пинг для Bing.

Генератор из GitHub Actions (сейчас) остаётся запасным вариантом (ночной полный пересбор). Основной — BullMQ, потому что только он знает про события «опубликовано».

### 2.3 Проверки качества (Quality gates)

Страница получает `index` только если проходит все пункты; иначе `noindex,follow` и не попадает в sitemap. Состояние хранится в таблице `SeoPage` (ключ, тип, статус `draft/noindex/indexed/removed`, причина, хеш, дата проверки).

- Объём: уникального текста ≥ 300 слов (хабы и практики) или ≥ 150 символов био (профиль).
- Уникальность: доля общего шаблонного текста ≤ 60 %; сравнение шинглами с уже существующими страницами; близкие дубли (> 85 %) — canonical на главную из группы или noindex.
- Данные: у «практика × город» — не менее 3 адвокатов с согласием или местный текст, проверенный человеком.
- Нет неподтверждённых слов («best», «top», «#1», «guaranteed») — запрещённый список, раздел 6.
- Нет PII: телефона, почты, адреса клиента, дел. Только публичные поля профиля.
- Скорость: HTML ≤ 30 КБ, ноль блокирующих скриптов.
- Это отвечает на политику Google о массовом контенте: [Spam policies](https://developers.google.com/search/docs/essentials/spam-policies) — определение «много страниц, созданных главным образом ради манипуляции ранжированием», пример: «массовая генерация страниц без пользы для читателей»; doorway — страницы под схожие запросы, ведущие к менее полезным промежуточным. Порога количества Google не называет. Отдельно: вторичные источники сообщают, что программные сайты могут надолго потерять доверие Google ([TechWyse по Mueller](https://www.techwyse.com/news/search-seo/google-john-mueller-programmatic-seo-site-trust-recovery)) — поэтому темп выкатки ограничен (2.7).

### 2.4 Бюджет сбросов и стоимость

- CloudFront: первые 1 000 путей инвалидации в месяц бесплатны, дальше около $0.005 за путь; один wildcard = 1 путь ([AWS Developer Guide](https://docs.aws.amazon.com/hi_in/AmazonCloudFront/latest/DeveloperGuide/PayingForInvalidation.md), цена за путь по сторонним источникам, не подтверждена на странице AWS).
- Правило: HTML-страницам ставим короткий TTL (1 час в браузере, 1 сутки в CloudFront) и сбрасываем точечно только то, что меняется «срочно» (удаление, смена согласия): ≤ 30 путей в сутки (~900/мес, бесплатно). Остальное обновится по TTL. Ночной wildcard `/lawyers/*` и `/attorneys/*` — 2 пути в сутки.
- Предохранитель: если за сутки набралось > 200 путей, заменяем их wildcard по префиксу, а не платим по одному. Потолок настраивается в админке (Promotion → Limits).
- Бесплатный объём CloudFront: 1 ТБ трафика и 10 млн запросов в месяц ([AWS](https://perfsys.com/blog/cloudfront-pricing-guide/), вторичный источник).

Оценка стоимости (S3 Standard $0.023/ГБ-мес, PUT $0.005 за 1000, GET $0.0004 за 1000 — [Upstash 2026](https://upstash.com/blog/aws-s3-pricing-explained-2026), вторичный источник; средний файл HTML+md+json-ld ≈ 40 КБ; полная перезапись раз в месяц + 5 % изменений в сутки):

| Страниц | Хранение | PUT/мес | CloudFront (до 10 млн запросов — бесплатно) | Итого в месяц |
|---|---|---|---|---|
| 10 тыс. | 0.4 ГБ ≈ $0.01 | 10k + 15k ≈ $0.13 | $0 | меньше $1 |
| 100 тыс. | 4 ГБ ≈ $0.09 | 100k + 150k ≈ $1.25 | $0 до 10 млн запросов; дальше ≈ $0.01 за 10 тыс. HTTPS | $2–10 |
| 1 млн | 40 ГБ ≈ $0.9 | 1M + 1.5M ≈ $12.5 | при 50 млн запросов ≈ $40 и ≈ 200 ГБ трафика | $50–80 |

Деньги уходят не на хранение, а на трафик ботов (ChatGPT/Perplexity и др. ходят много). Защита: правила в WAF (rate limit для ботов), бюджет на AWS Budgets уже есть как модуль (`infra/modules/budget`), добавить отдельный тег `seo` для расчёта.

### 2.5 Sitemap

- `/sitemap.xml` — индекс; `/sitemaps/lawyers-<n>.xml`, `attorneys-<n>.xml`, `posts-<n>.xml`, `guides.xml`; в каждом файле ≤ 10 000 адресов (с запасом от лимита 50 000 / 50 МБ).
- `lastmod` = реальная дата изменения содержимого. Не меняется — не трогаем.
- В sitemap только страницы со статусом `indexed`.
- Для Bing — ещё IndexNow (2.9).

### 2.6 robots.txt и AI-боты

Политика по умолчанию (меняется в админке Promotion → AI crawlers):

- Разрешить поисковые и «по запросу пользователя» боты: Googlebot, Bingbot, OAI-SearchBot, ChatGPT-User, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User. По описанию вендорных сводок, OAI-SearchBot решает, попадёте ли вы в ответы поиска ChatGPT ([Otterly](https://help.otterly.ai/ai-crawlers), [Anagram](https://www.anagram.ai/blog/ai-crawlers-explained-gptbot-claudebot-perplexitybot-and-how-to-let-them-in-2026)); источники неофициальные, перед запуском проверить на страницах самих вендоров.
- Тренировочные боты (GPTBot, ClaudeBot, Google-Extended, CCBot): по умолчанию запрещены. Блок Google-Extended, как пишут сводки, не влияет на поиск и AI Overviews. Для юридической площадки с данными адвокатов разумный старт — запрет обучения, видимость в поиске сохраняем. Включить обучение можно позже.
- Закрыть для всех: `/api/`, `/auth/`, `/qr/`, `/q/`, `/g/`, `/r/`, `/internal/`, параметры `?utm`.
- Некоторые боты «по запросу пользователя» robots не соблюдают (OpenAI сам так пишет про ChatGPT-User); для жёсткой защиты нужны правила WAF, не robots.

### 2.7 llms.txt, llms-full.txt, markdown-зеркала

Честно: на 2026 год доказательств пользы нет. Google (Gary Illyes, июль 2025, по пересказам) не поддерживает; исследование 300 тыс. доменов (SE Ranking, ноябрь 2025) не нашло влияния на цитирование; по журналам одного вендора из 62 100 заходов AI-ботов за 90 дней только 84 запросили файл; зато его читают IDE-агенты ([DEV.to](https://dev.to/mrtd/llmstxt-reality-check-10-of-sites-have-it-ai-search-engines-almost-never-read-it-2281), [Codersera, май 2026](https://codersera.com/blog/llms-txt-complete-guide-2026/)). Вывод: делаем, потому что почти бесплатно (один статический файл), но не ждём трафика и не тратим на это время.

- `/llms.txt` — короткий список: о проекте, ссылки на хабы, правила цитирования, дисклеймер «не юридическая консультация».
- `/llms-full.txt` — только публичные гиды и описания практик (без адвокатов и без постов).
- Markdown-зеркала: `/<путь>/index.md` рядом с каждой индексируемой страницей, `rel="alternate" type="text/markdown"`. Генерируются в том же рендере, лишней нагрузки нет.
- Всё это включается отдельным тумблером.

### 2.8 JSON-LD по типам

- Organization + WebSite на главной (название, логотип, `sameAs` — профили в соцсетях). Google для организаций советует самый точный подтип Organization ([Google Organization](https://developers.google.com/search/docs/appearance/structured-data/organization)); страница ничего не говорит про LegalService/Attorney, то есть особых звёзд/расширенного вида они не дают, но семантику для поиска и AI задают.
- Адвокат: `Attorney` (подтип LegalService/LocalBusiness) только если адвокат сам опубликовал рабочий адрес; иначе `Person` с `jobTitle: Attorney`, `knowsAbout`, `areaServed`, `identifier` — номер лицензии не выводим без согласия. Без `aggregateRating` (пока нет видимых отзывов на странице).
- Практика × город: `WebPage` + `FAQPage` + `BreadcrumbList`. FAQ только реальные вопросы с ответами на странице.
- Пост: `Article`/`SocialMediaPosting` (автор → Person), `VideoObject` для reel.
- Сам LawBid — не юрфирма и не `LegalService`; не маркируем площадку как оказывающую юруслуги.

### 2.9 Картинки OG, canonical, noindex, hreflang

- OG-картинки 1200×630 рисуются при рендере (шаблон: имя, практика, штат; фото — только если разрешено `photo_from`), кладутся в S3 как `/og/<hash>.png`, без обращения к API.
- canonical: самоссылающийся, без параметров. Разные URL одного и того же — 301.
- noindex: нет согласия, не прошёл проверки, поиск внутри сайта, параметры. noindex-страницы не блокируем в robots (иначе Google не увидит метку).
- hreflang: пока только английский; не добавляем, пока нет испанской/русской версии (в США «Spanish» — вероятное расширение). Если появится — полный набор взаимных ссылок и `x-default`.
- IndexNow: ключ-файл `/<key>.txt`, задача шлёт пакетами до 10 000 адресов при публикации/удалении. Участники по состоянию на октябрь 2026: Bing, Yandex, Seznam, Naver, Yep и др.; Google не участвует ([eseospace](https://eseospace.com/blog/bing-webmaster-tools-indexnow-ai-search/)). Влияние IndexNow на ChatGPT не подтверждено.

### 2.10 Бюджет скорости

Пороги Core Web Vitals в 2026 не менялись: LCP ≤ 2.5 с, INP ≤ 200 мс, CLS ≤ 0.1, оценка по 75-му перцентилю реальных пользователей ([сводка](https://corewebvitals.io/core-web-vitals), вторичный источник). Для нас: HTML ≤ 30 КБ, CSS инлайн ≤ 6 КБ, без JS на страницах каталога, изображения AVIF/WebP с заданными размерами, шрифты системные, `Cache-Control` как выше. Страницы не должны грузить Flutter-приложение — ссылка «Open in the app» ведёт на него отдельно.

---

## 3. Индексация в приложении (без видимых изменений интерфейса)

Факты: Firebase App Indexing устарело, Google рекомендует Android App Links и iOS Universal Links для перехода из поиска в приложение ([Firebase docs](https://firebase.google.cn/docs/app-indexing)). Значит, никакого нового SDK на Android не ставим.

Что меняем (интерфейс не трогаем, вид и кнопки прежние):

1. Universal Links / App Links: добавить `/attorneys/*`, `/lawyers/*`, `/posts/*`, `/reels/*` в `APP_PATHS` (`scripts/seo/well-known.mjs:21-31`) и в `AndroidManifest.xml:121-128`. В `deep_link.dart` сопоставить их с уже существующими экранами (`/lawyer/:username`, `/post/:id`). Но тогда нажатие на результат Google в телефоне откроет приложение, а не сайт; для человека без приложения сайт откроется как прежде. Решение владельца — вопрос 3.
2. Spotlight (iOS): когда пользователь открывает профиль адвоката, приложение создаёт `NSUserActivity` с `webpageURL` = публичный адрес, `isEligibleForSearch = true`, `isEligibleForPublicIndexing = false` (индексируется только на устройстве, не публикуется в общий индекс). Тип активности добавить в `Info.plist:99-102`. Нативный код — мелкий Swift-канал, экран не меняется. Индексируем только публичные поля (имя, практика), только адвокатов, которых человек сам открыл/сохранил. Клиентские данные не индексируем никогда.
3. Siri shortcuts (App Intents) — этап 2, после релиза: «Open my last case» уже вне этого пакета. Сейчас не делаем.
4. Handoff, Android: ничего, кроме App Links; `assetlinks.json` ждёт SHA-256 подписи Play (`well-known.mjs:121-123`) — шаг владельца.
5. Проверка: `adb shell pm verify-app-links --re-verify com.lawbid.lawbid`, на iOS — заметки в `docs/deeplinks/README.md`.

---

## 4. План ASO для магазинов

Правила приватности и стиль: тексты коротко, без обещаний результата.

- App Store (iOS). Полей: Name (30), Subtitle (30), Keywords (100, без повторов из названия), Promotional Text (170), Description. Пример каркаса: Name «LawBid: Find a Lawyer», Subtitle «Post your case, compare offers». Слова, на которые стоит смотреть: lawyer, attorney, legal help, free consultation, find a lawyer near me, divorce lawyer, immigration lawyer, DUI, personal injury, landlord tenant. В Keywords не ставить «best», «#1», названия конкурентов.
- Custom Product Pages: с июля 2025 страницу можно привязать к ключевым словам из поля Keywords, и она показывается в органическом поиске; лимит страниц по отчётам вендоров вырос с 35 до 70 ([Adapty](https://adapty.io/blog/custom-product-pages-app-store/), [AppTweak](https://www.apptweak.com/aso-blog/app-store-optimization-news-app-store-updates)), точные даты и цифры сверить в документации Apple. План: по одной странице на практику (divorce, immigration, injury, criminal, tenant, business) с своими скриншотами. Каждое слово привязывается только к одной странице.
- In-App Events: показывать только события, которые есть (например «Free legal Q&A week»). Не придумывать.
- Apple Ads (бывш. Search Ads): вендоры сообщают, что с марта 2026 в поиске App Store добавляются места для рекламы ([Foxdata](https://foxdata.com/en/blogs/apple-search-ads-expansion-2026-why-aso-alone-wont-cut-it-anymore/)). Платное — только по решению владельца и с лимитом бюджета в админке. По умолчанию выкл.
- Google Play: Title (30), Short description (80), Full description (4000), графика. Custom store listings: до 50 штук, по стране, ключевому слову или рекламной кампании ([Play Console](https://play.google.com/console/about/customstorelistings/)). Store listing experiments — A/B для иконки, графики, описаний до 5 языков. Начать с 3 листингов (injury, immigration, divorce).
- Скриншоты и видео: 6–8 кадров: «Post your case → Compare offers → Chat → Verified attorneys → Reels/Posts». Не показывать выдуманные отзывы и реальные данные клиентов. Видео 15–30 с. Тексты на скриншотах с отказом: «Not a law firm».
- Отзывы: приложение просит оценку один раз после успешного события (например, клиент выбрал адвоката), не чаще 1 раза в 120 дней, никогда после ошибки или в чате. Использовать системное окно (Apple `SKStoreReviewController`, Google In-App Review). Никаких «оцените на 5 звёзд — получите бонус» (правила магазинов запрещают). Отзывы без вмешательства; отвечать на каждый.
- Метрики: показы страницы, конверсия страницы в установку, ключевые слова в топ-10, эксперименты. Данные берутся из App Store Connect / Play Console вручную в начале.

---

## 5. Чек-лист для страницы «Продвижение» (Promotion) в админке

Страница показывает: тумблеры (всё OFF), статус каждого канала (not started / in progress / done), число страниц по статусам, последняя сборка, размер очереди, потолки (Limits), и инструкции. Что система делает сама и что нажимает владелец:

| Канал | Что делает система | Шаги владельца (названия в интерфейсах) |
|---|---|---|
| Google Search Console | Выдаёт файл подтверждения (DNS TXT), sitemap-индекс, отчёт «страниц в индексе» (вручную) | Add property → Domain `lawbid.dev` → добавить DNS-запись → Sitemaps → вставить `sitemap.xml`; Removals для срочного удаления |
| Bing Webmaster Tools | Генерирует IndexNow-ключ и шлёт пинги | Add site → Import from Google Search Console → Sitemaps; включить AI Performance (отчёт цитирований в Copilot, превью с февраля 2026, [eseospace](https://eseospace.com/blog/bing-webmaster-tools-indexnow-ai-search/)) |
| Google Business Profile | Подсказывает текст | Для самой площадки профиль почти наверняка не подойдёт: Google не пускает посредников и лид-генерацию ([Birdeye, 2025](https://birdeye.com/blog/google-business-profile-guidelines-2025)). Это вторичный источник, подтвердить на странице правил Google. Адвокаты заводят свои профили сами; мы даём им памятку (опционально) |
| Apple Business Connect | — | Заходит с Apple ID, заявляет «LawBid» как бизнес (Maps, Siri, Wallet); если нет физического офиса — выбрать онлайн-бизнес / пропустить |
| App Store Connect | Готовые тексты, ключевые слова, список скриншотов | Product Page Optimization / Custom Product Pages, In-App Events, Ratings and Reviews; ввод текстов |
| Play Console | Тексты, список листингов; SHA-256 для `assetlinks.json` | Store presence → Custom store listings; Test and release → App integrity → App signing key certificate (скопировать SHA-256 в переменную `ANDROID_APP_SHA256`) |
| Justia / Avvo / FindLaw | Готовая карточка компании | Это каталоги адвокатов; для площадки они нужны как упоминание и ссылка, не для лидов. Условия размещения у каждого свои — проверять при заявке; ссылку (backlink) можно просить только честно |
| Yelp / BBB | Готовый текст | Создать бизнес-страницу, подтвердить владение; BBB платный для аккредитации — решение владельца |
| Reddit / Quora / форумы | Список тем и ответов-черновиков (без публикации) | Отвечать вручную от человека с раскрытием связи с LawBid. Правила Reddit про самопродвижение: не вставлять ссылки в каждый ответ. Автопостинга нет |
| YouTube / TikTok / Instagram / Facebook | Готовые заголовки, описания, субтитры для коротких видео | Создать аккаунты, привязать в `sameAs`. Только своё реальное видео |
| PR и отзывы | Шаблон письма журналисту, список изданий NY (вручную) | Отправка за владельцем |

Автоматизация (система): страницы, sitemap, robots, llms.txt, JSON-LD, OG, IndexNow, проверки, отчёт. Руками (владелец): регистрация аккаунтов, подтверждение владения доменом, платные решения, переписка с каталогами, публикация постов на форумах.

---

## 6. Правила рекламы (NY) и приватность

Это не юридическая консультация. Перед включением показать текст юристу в Нью-Йорке.

- По описанию в статье NYSBA (черновик от 19 августа 2026), с 1 июня 2026 Presiding Justices изменили правила рекламы: правило 7.4 убрано, его содержание перенесено в 7.1(c), в общих чертах применены подходы ABA 2018 ([NYSBA draft](https://nysba.org/wp-content/uploads/2026/08/Article-on-Advertising-Amendments-draft-8.19.2026.docx)). Текст черновика — проверить финальный на сайте судов штата.
- Общее правило 7.1: реклама не должна быть ложной, обманчивой или вводящей в заблуждение. Заявлять «специалист/сертифицирован» нельзя без утверждённой организации-сертификатора и указания её имени (по тому же источнику).
- Поэтому страницы НЕ пишут: «best», «top», «#1», «leading», «guaranteed result», «we will win», «lowest fees», «specialist/expert» (если нет сертификата), «free consultation» без условий, сравнений с другими адвокатами без объективной основы, отзывы клиентов как обещание результата.
- Страницы пишут: «Verified attorney» (с пояснением, что значит verified — лицензия подтверждена по реестру), штат лицензии, практики как «practices in» (не «specializes»), нейтральное «Compare offers». Рейтинг звёзд — только когда это реальные отзывы с видимым источником и дисклеймером.
- Метка «Attorney Advertising»: в описании NYSBA я не нашёл подтверждения, что она сохранилась в итоговом тексте. Заложить в шаблон страницы адвоката опциональный блок «Attorney Advertising. Prior results do not guarantee a similar outcome» с тумблером; включать по совету юриста. Пока включено по умолчанию на страницах адвокатов из NY.
- Площадка не юрфирма и не гарантирует результат; дисклеймер уже в подвале (`build.mjs:125-127`). Сохранить.
- Приватность: на страницах только адвокаты с явным согласием `public_profile_opt_in = true`, только публичные поля. Нет телефонов/почты клиентов, нет дел. Номер лицензии — только с согласием. Фото — по `photo_from`. В логах генератора только id страниц, без имён и текстов. Согласие снимается — страница удаляется (2.2).
- Посты клиентов никогда не индексируются. Только посты адвокатов с отдельным согласием на каждый пост («Allow search engines to show this post»).

---

## 7. Разбивка на задачи (PR), порядок, тесты

Порядок: 1 → 2 → 3 → (4, 5, 6 параллельно) → 7 → 8. Файлы не пересекаются.

1. **Согласие и таблица состояний** (трогает `schema.prisma`)
   - Файлы: `apps/api/prisma/schema.prisma` (+ миграция expand/contract): `AttorneyProfile.public_profile_opt_in Boolean @default(false)`, `Post.seo_opt_in Boolean @default(false)`, новая модель `SeoPage` (key, type, status, reason, content_hash, updated_at, indexed_at); модуль `apps/api/src/modules/seo/*` (настройки, статусы); `FeatureFlag` ключи `seo.*` (все false).
   - Тесты: unit на фильтр публичности, проверка миграции на пустую БД.
   - Smoke: флаги выключены — публичный каталог пуст.
2. **Генератор (BullMQ) и снимок**: `apps/api/src/modules/seo/render/*`, `jobs` регистрация, чистые функции рендера; перенос логики из `scripts/seo/build.mjs`. Quality gates. Тесты: golden-файлы HTML, проверка отсутствия PII, дедупликация задач. Без `schema.prisma`.
3. **Выкладка в S3 и сброс кэша**: `infra/modules/web/*` (prefix, политика на запись для воркера), `apps/api/src/modules/seo/publish/*`, бюджет инвалидаций. Тесты: dry-run с локальным S3 (minio), счётчик путей. Smoke: удаление страницы за минуты.
4. **Sitemap + robots + IndexNow + llms.txt + markdown**: `apps/api/src/modules/seo/discovery/*`, правки `scripts/seo/merge-site.mjs`. Тесты: каждый файл ≤ 10 000 адресов, валидный XML, robots по тумблеру ботов.
5. **JSON-LD + OG + страницы поста/города**: шаблоны; удалить `aggregateRating`. Тесты: валидация schema.org, отсутствие запрещённых слов (список из раздела 6), LCP-бюджет HTML ≤ 30 КБ.
6. **Приложение (без UI)**: `well-known.mjs`, `AndroidManifest.xml`, `Info.plist`, `Runner.entitlements`, `deep_link.dart`, нативный Swift-мост `NSUserActivity`. Тесты: `deep_link_platform_config_test.dart`, `well-known.test.mjs`. Smoke: `adb ... verify-app-links`, на iOS тест через Notes-ссылку.
7. **Админка «Продвижение»**: `apps/admin/src/app/(app)/promotion/*`, API `apps/api/src/modules/seo/admin/*`. Чек-лист из раздела 5, тумблеры (OFF), счётчики, потолки. Тесты: рендер, права. Только владелец видит.
8. **ASO-пакет**: `docs/aso/*` (тексты, ключевые слова, скриншоты, схема отзывов), мягкий запрос оценки в приложении (без UI-изменений, системное окно) — отдельным файлом в `apps/mobile/lib/core/rating/*`. Тесты: правило «не чаще 120 дней».

Только задача 1 трогает `schema.prisma`. Задача 2 может потребовать индекс; в этом случае отдельным мелким PR на тот же файл после 1.

---

## 8. Вопросы владельцу (да/нет)

1. Показывать в интернете только адвокатов, которые сами включили галочку «Show my profile on Google» (по умолчанию выключена)? Это безопасно, но даёт мало страниц на старте. Мой выбор: да.
2. Запретить ботам обучение моделей (GPTBot, ClaudeBot, Google-Extended), но разрешить поисковым и AI-ответам? Мой выбор: да.
3. Пусть ссылки на `/attorneys/…` и `/lawyers/…` с телефона открываются в приложении, если оно стоит? Мой выбор: да, но с сайтом как запасным.
4. Включить метку «Attorney Advertising» на страницах адвокатов из Нью-Йорка по умолчанию, пока юрист не подтвердит, что она не нужна? Мой выбор: да.
5. Разрешить отдельную сумму на платную рекламу в магазинах (Apple Ads) в админке, по умолчанию 0? Мой выбор: нет, пока нет органики.

---

## 9. Источники (даты — как в выдаче; многие вторичные)

- Google Search Central, Spam policies (scaled content abuse, doorway, site reputation): https://developers.google.com/search/docs/essentials/spam-policies — открыто 2026-10-27
- Google, Organization structured data: https://developers.google.com/search/docs/appearance/structured-data/organization — 2026-10-27
- Программный SEO и доверие Google (Mueller, пересказ): https://www.techwyse.com/news/search-seo/google-john-mueller-programmatic-seo-site-trust-recovery
- llms.txt: https://dev.to/mrtd/llmstxt-reality-check-10-of-sites-have-it-ai-search-engines-almost-never-read-it-2281 ; https://codersera.com/blog/llms-txt-complete-guide-2026/ (май 2026)
- AI-боты: https://help.otterly.ai/ai-crawlers ; https://www.anagram.ai/blog/ai-crawlers-explained-gptbot-claudebot-perplexitybot-and-how-to-let-them-in-2026 ; https://dev.to/brandswarm/robotstxt-for-ai-search-the-2026-cheat-sheet-gptbot-claudebot-and-the-rest-16a
- Bing, IndexNow, AI Performance: https://eseospace.com/blog/bing-webmaster-tools-indexnow-ai-search/ ; https://geotoolbox.ai/blog/bing-webmaster-tools
- App Store CPP, Apple Ads: https://adapty.io/blog/custom-product-pages-app-store/ ; https://www.apptweak.com/aso-blog/app-store-optimization-news-app-store-updates ; https://foxdata.com/en/blogs/apple-search-ads-expansion-2026-why-aso-alone-wont-cut-it-anymore/
- Google Play custom listings: https://play.google.com/console/about/customstorelistings/ ; https://support.google.com/googleplay/android-developer/answer/12053285
- Core Web Vitals 2026: https://corewebvitals.io/core-web-vitals
- Firebase App Indexing устарело: https://firebase.google.cn/docs/app-indexing
- CloudFront, инвалидации: https://docs.aws.amazon.com/hi_in/AmazonCloudFront/latest/DeveloperGuide/PayingForInvalidation.md ; цены: https://perfsys.com/blog/cloudfront-pricing-guide/
- S3 цены: https://upstash.com/blog/aws-s3-pricing-explained-2026
- Avvo/Justia/FindLaw структура (поверхностно): https://apify.com/ahmed_jasarevic/avvo-scraper ; https://docs.anysite.io/api-reference/justia/justialawyerssearch.md
- Google Business Profile и лид-генерация: https://birdeye.com/blog/google-business-profile-guidelines-2025 ; https://seroundtable.com/google-my-business-guidelines-for-practitioners-28183.html
- NY реклама адвокатов (июнь 2026): https://nysba.org/wp-content/uploads/2026/08/Article-on-Advertising-Amendments-draft-8.19.2026.docx ; https://rankings.io/blog/attorney-advertising-rules-ny/
- Apple Business Connect: https://www.engadget.com/apple-business-connect-maps-messages-171509900.html

Что не удалось проверить по первоисточникам: страницы правил OpenAI/Anthropic/Perplexity для ботов, цены AWS, структура URL Zillow/Yelp/Thumbtack (поиск не дал результатов), правила листинга Justia/Avvo/FindLaw, точный текст правила NY 7.1 после июня 2026, Google App Indexing/Spotlight (поиск по Spotlight не вернул результатов). Перед запуском сверить.

---

## Приложение А. Технические детали

- Ключ страницы: `type:slug` (например `attorney:jdoe`, `practice-city:divorce:ny:brooklyn`). Хеш содержимого = sha256 от отрендеренного HTML без даты.
- Очередь: `seo-render` (concurrency 2, attempts 3, backoff), `seo-publish` (батч 100 PUT), `seo-notify` (IndexNow ≤ 10 000 URL за запрос). Все с лимитами через `queue-hardening.ts`.
- Права: воркер пишет только в префиксы `lawyers/`, `attorneys/`, `posts/`, `reels/`, `guides/`, `sitemaps/`, `og/`, `llms*.txt`, `*.md`. Приложение (`index.html`, `main.dart.*`) — никогда.
- CloudFront-функция `seo-index` (`infra/modules/web/main.tf:353`): расширить `PUBLIC` регулярку новыми префиксами `posts|reels|guides|sitemaps|og` и `ROOT_FILES` на `/llms.txt`, `/llms-full.txt`, `/<indexnow-key>.txt`. То же в `app-noindex` (`:455`). Деплоить функции через Terraform, это шаг владельца (сайт сейчас намеренно выключен до публикации функции).
- Заголовки ответа для HTML: `Cache-Control: public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400`; для sitemap: `max-age=3600`; `X-Robots-Tag` не ставим на индексируемые страницы.
- Админ-тумблеры: `seo.pages.enabled`, `seo.attorneys.enabled`, `seo.posts.enabled`, `seo.cities.enabled`, `seo.llms.enabled`, `seo.markdown.enabled`, `seo.indexnow.enabled`, `seo.ai.search_bots.allow`, `seo.ai.training_bots.allow`, `seo.ad_label.ny`. Лимиты: `seo.max_new_pages_per_day` (старт 200, как мягкий разгон для доверия Google), `seo.max_invalidation_paths_per_day` (30), `seo.max_pages_total`.
- Темп выката: не больше 200 новых индексируемых страниц в сутки на старте, рост ×2 в неделю при отсутствии просадок в отчёте Search Console (ручная проверка владельца).
- Тест на запрещённые слова: список в `docs/aso/banned-claims.json`, проверка на каждом рендере, провал = noindex + алерт.
- Логи: только `key`, `status`, `reason`, длительность. Никаких имён, био и текстов.
- Проверка перед включением: `curl -I` страницы (200, canonical, robots), Rich Results Test (вручную), Lighthouse на 3 типовых страницах, `xmllint` для sitemap, проверка 404/410 на удалённой.

---

## Итог (5 строк)

1. Основа уже есть: статические страницы, sitemap, robots, ссылки в приложение; строим поверх и добавляем качество и согласие адвокатов.
2. Главный риск — «массовые пустые страницы»: поэтому noindex до реального содержания, медленный разгон и тумблеры OFF.
3. Стоимость мала: около $2–10 в месяц на 100 тыс. страниц, основные траты — трафик ботов, ограничены WAF и бюджетом.
4. Приложение: Universal/App Links и Spotlight без изменения вида; Firebase App Indexing не нужен.
5. Нужны ваши 5 ответов да/нет (раздел 8) и перед запуском проверка юристом из NY; 8 PR, схему БД трогает только первый.

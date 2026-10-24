# Перенос домена lawbid.dev в Cloudflare (для фото в R2)

Домен остаётся куплен в Namecheap. В Cloudflare переезжают только записи DNS.
Сайт, приложение и почта не прерываются, если записи перенести точно.

## Шаги для владельца (≈ 15 минут, потом ожидание до нескольких часов)

1. Cloudflare → **Domains → Add a domain** → `lawbid.dev` → тариф **Free**.
2. Cloudflare сам найдёт записи. Сверьте со списком ниже: каждая должна быть,
   и у **каждой** облачко **серое** («DNS only»). Оранжевое облачко не включать.
3. Cloudflare покажет **два nameserver** (вида `xxx.ns.cloudflare.com`).
4. Namecheap → Domain List → lawbid.dev → **Nameservers → Custom DNS** →
   вписать эти два → сохранить.
5. Написать мне. Я проверю, что сайт, API, админка и почта работают, и
   дальше включу фото в R2 (bucket, адрес media.lawbid.dev, ключ).

## Записи, которые должны быть в Cloudflare (снято 2026-10-24)

| Имя | Тип | Значение | Зачем |
| --- | --- | --- | --- |
| `lawbid.dev` (@) | CNAME | `d28wq9t218p67x.cloudfront.net` | сайт (Cloudflare сам «распрямит» CNAME в корне) |
| `www` | CNAME | `d28wq9t218p67x.cloudfront.net` | сайт |
| `api` | CNAME | `lawbid-prod-alb-1784804712.us-east-1.elb.amazonaws.com` | сервер приложения |
| `admin` | CNAME | `lawbid-prod-alb-1784804712.us-east-1.elb.amazonaws.com` | админка |
| `_5eda52806173c2839c38c5c9b8e2a5fc` | CNAME | `_d45e7b05b2151faaf78043561f2b1bae.wzccmgtwzk.acm-validations.aws` | сертификат сайта |
| `_57b01c6d74e899100a9c25d167f161a1.www` | CNAME | `_a5a76101b0e5ea8d8a5ac054d33cf2d2.wzccmgtwzk.acm-validations.aws` | сертификат www |
| `vyjcsnvni5meghmx5ine4ymlgwfuz4rl._domainkey` | CNAME | `vyjcsnvni5meghmx5ine4ymlgwfuz4rl.dkim.amazonses.com` | почта (подпись) |
| `6tevsbspo2yvwxinnav7ouakygwge6zn._domainkey` | CNAME | `6tevsbspo2yvwxinnav7ouakygwge6zn.dkim.amazonses.com` | почта (подпись) |
| `m735wfkzvrmrifshkks6xy3ichdst22z._domainkey` | CNAME | `m735wfkzvrmrifshkks6xy3ichdst22z.dkim.amazonses.com` | почта (подпись) |
| `_amazonses` | TXT | значение из Namecheap (не менять) | почта (проверка домена) |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | почта |

Сертификат для api/admin (ACM) может иметь свою запись `_…api` / `_…admin` —
если Cloudflare её нашёл, оставить. Всё, что есть в Namecheap и чего нет
здесь, — тоже перенести как есть (Cloudflare делает это сам на шаге 2).

## После переноса: два обязательных пункта для R2 (владелец, Cloudflare Dashboard)

Без них фото в R2 будут открываться плохо (каждый показ идёт в R2 и считается
платным чтением) или не загружаться из браузера (веб-версия и админка).

### 1. CORS у бакета (R2 → ваш бакет → Settings → CORS Policy → Add CORS policy → вкладка JSON)

Вставить как есть и нажать **Save**:

```json
[
  {
    "AllowedOrigins": [
      "https://lawbid.dev",
      "https://www.lawbid.dev",
      "https://admin.lawbid.dev",
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:8080"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type", "Cache-Control"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

- `PUT` нужен загрузке фото из браузера по подписанной ссылке (в ней фиксированы
  `Content-Type` и `Cache-Control`), `GET`/`HEAD` — показу и проверке размера.
- Три `localhost` — только для разработки (веб 3000, админка 3001, Flutter web 8080); в
  `AllowedOrigins` порт нельзя заменить звёздочкой, поэтому порты перечислены. Если
  разработка идёт на другом порту, добавьте его строкой.
- Из терминала: `npx wrangler r2 bucket cors set <имя-бакета> --file cors.json`
  (у Wrangler другой формат файла, см. developers.cloudflare.com/r2/buckets/cors);
  проверить: `npx wrangler r2 bucket cors list <имя-бакета>`. Проще вставить JSON
  выше в Dashboard.
- **Если бакет уже отдаёт через `media.lawbid.dev`, после смены CORS очистить кэш**:
  Cloudflare → Caching → Configuration → **Purge Cache → Custom Purge** → Hostname
  `media.lawbid.dev` (иначе в уже закэшированных ответах не будет CORS-заголовков).

### 2. Правило кэша для `media.lawbid.dev` (Cloudflare → lawbid.dev → Caching → Cache Rules → Create rule)

| Поле | Значение |
| --- | --- |
| Rule name | `media: cache everything` |
| When incoming requests match | **Hostname** equals `media.lawbid.dev` |
| Cache eligibility | **Eligible for cache** («Cache Everything») |
| Edge TTL | **Ignore cache-control header and use this TTL** → **1 day** |
| Browser TTL | **Respect origin TTL** («Use cache-control header if present») |

Браузер хранит файл год (в самом объекте `immutable, max-age=31536000`), край
Cloudflare держит сутки. Дополнительно, по желанию: Caching → Tiered Cache →
**Smart Tiered Cache Topology** (бесплатно, меньше обращений в R2).

### 3. Проверка одной командой

Возьмите адрес любого фото из приложения (например, открыть аватар в браузере →
скопировать адрес) и выполните:

```
sh scripts/ops/verify-r2-media.sh https://media.lawbid.dev/<адрес-фото>
```

Все пять строк должны быть `OK`: `cf-cache-status: HIT` на втором запросе, `immutable`
в `Cache-Control`, `Accept-Ranges`, `Access-Control-Allow-Origin` и разрешённый `PUT`
в preflight. Любая `FAIL` объясняет, какую из двух настроек выше поправить. Также
в админке → Состояние системы строка «Фото и медиа (Cloudflare R2)» должна быть зелёной,
а «Хранилище» → строка «Cloudflare R2» показывает размер и число файлов (считается раз в сутки).

## Необязательно: улучшения Cloudflare (ничего платного не включено)

Включайте по одному, только если нужно. Все цифры по состоянию на 2026-10-24, цены на
страницах Cloudflare меняются.

| Что | Где включить | Цена | Зачем / замечание |
| --- | --- | --- | --- |
| **HTTP/3 (QUIC)** | Network → HTTP/3 (with QUIC) | **$0** (есть на Free) | Быстрее на плохой мобильной сети. Безопасно, откат — выключить. |
| **Brotli** | Speed → Optimization → Content Optimization → Brotli | **$0** (есть на Free) | Сжимает текст (JSON, SVG, JS). Фото уже сжаты (WebP), для них эффекта нет. |
| **Early Hints / 0-RTT** | Speed / Network | **$0** | Мелкий выигрыш; можно не включать. |
| **Polish** (оптимизация картинок, lossy/lossless, WebP) | Speed → Optimization → Image Optimization → Polish | **платный тариф Pro (≈ $20–25 в месяц за зону)**: на Free его нет | У нас картинки уже ужимает сервер при загрузке (WebP), выигрыш небольшой. Не включать без нужды. |
| **AVIF / ресайз «на лету»** (Cloudflare Images / Image Transformations) | Images → Transformations | есть бесплатная квота, дальше платно (точные цифры смотреть на странице цен Cloudflare Images) | Нужен код в приложении (другой адрес картинки); не сейчас. |
| **Smart Tiered Cache** | Caching → Tiered Cache | **$0** | Меньше обращений к R2. Рекомендуется. |
| **Hotlink protection / WAF-правила** | Security | Free: ограниченно | Если чужие сайты начнут встраивать наши фото. |

Ничего из таблицы не нужно для работы: HTTP/3, Brotli и Smart Tiered Cache — безопасные
бесплатные. Остальное — решение владельца по цене.

## Как это делают другие (заметки по исследованию, 2026-10-24)

- **Cloudflare R2 docs:** публичный бакет только через свой домен (r2.dev ограничен по
  скорости и без кэша «только для разработки»); для кэша всех типов файлов нужен Cache
  Rule «Cache Everything»; включить Smart Tiered Cache; после смены CORS очистить кэш
  хоста. Всё это выше.
- **Крупные приложения** (Discord, Telegram и т.п. хранят медиа под неугадываемыми
  адресами и отдают с CDN с годовым `immutable`): у нас так же, новый файл = новый ключ.
- **Мониторинг размера:** Cloudflare показывает метрики R2 в Dashboard и в GraphQL
  Analytics API; мы считаем сами (один обход бакета раз в сутки, ≈ 1 цент за миллион
  файлов), потому что это не требует отдельного токена аналитики и работает с теми же ключами R2.

## Откат
Namecheap → Nameservers → **Namecheap BasicDNS**. Старые записи в Namecheap
не удаляются, поэтому всё возвращается как было.

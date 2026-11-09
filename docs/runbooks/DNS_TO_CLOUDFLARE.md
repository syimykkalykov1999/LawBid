# Фото в Cloudflare R2: перенос домена и включение

Домен остаётся куплен в Namecheap. В Cloudflare переезжают только записи DNS.
Сайт, приложение и почта не прерываются, если записи перенести точно.

## Чек-лист владельца: фото в R2 (делать строго по порядку, в самом конце)

Пока не сделан шаг 9, ничего не меняется: фото идут в AWS. Чаты, файлы дел и
документы всегда остаются в AWS, видео в Bunny.

1. **Домен в Cloudflare.** Domains → Add a domain → `lawbid.dev` → тариф Free. Сверьте
   записи с таблицей ниже: все на месте, у **каждой** облачко **серое** (DNS only).
2. **Namecheap.** Domain List → lawbid.dev → Nameservers → Custom DNS → два адреса из
   Cloudflare → сохранить. Дождитесь, когда Cloudflare напишет Active (до нескольких часов).
3. **Бакет.** R2 → Create bucket → имя `lawbid-media`.
4. **Домен бакета.** Бакет → Settings → Custom Domains → Add → `media.lawbid.dev` →
   дождитесь Active. Адрес `r2.dev` не включать.
5. **CORS.** Бакет → Settings → CORS Policy → Add CORS policy → вкладка JSON → вставить → Save:

   ```json
   [
     {
       "AllowedOrigins": ["https://lawbid.dev", "https://www.lawbid.dev", "https://admin.lawbid.dev"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["Content-Type", "Cache-Control"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

6. **Правило кэша.** lawbid.dev → Caching → Cache Rules → Create rule:

   | Поле | Значение |
   | --- | --- |
   | Rule name | `media: cache everything` |
   | Hostname equals | `media.lawbid.dev` |
   | Cache eligibility | Eligible for cache |
   | Edge TTL | Ignore cache-control header and use this TTL → 1 day |
   | Browser TTL | Respect origin TTL |

7. **Сайт пускает R2.** Один раз `terraform apply` в `infra/envs/prod` с кодом этой версии
   (перед ним `scripts/deploy/current-tag.sh`, см. ловушку 1 в `DEPLOY_PROD.md`). Без этого
   сервер сам оставит фото в AWS и покажет красную строку.
8. **Ключи.** R2 → Manage API Tokens → Create Account API token → Object Read & Write →
   только бакет `lawbid-media`. Админка → Ключи и сервисы → Cloudflare R2 → 5 полей: Account ID,
   Access Key ID, Secret Access Key, `lawbid-media`, `https://media.lawbid.dev` →
   Сохранить → **Проверить** (должно быть зелёно; если нет, текст ошибки говорит, какой шаг
   поправить) → **Включить**.
9. **Включить.** Админка → Настройки → `media.public_store` = `r2`.
10. **Проверка одной командой:**

    ```
    sh scripts/ops/verify-r2-media.sh
    ```

    Все строки `OK`. В «Здоровье системы» строка «Хранилище файлов» зелёная. Смените аватар в приложении: фото показывается.

**Если R2 не готов** (ключи неверны, домен не отвечает, сайт не пускает), загрузка не ломается:
новые фото идут в AWS, а в «Здоровье системы» строка «Хранилище файлов» красная и объясняет
причину. Сервер проверяет R2 сам раз в минуту и начнёт писать туда, когда всё заработает.

**Откат:** `media.public_store` = `aws`. Новые фото снова в AWS, уже загруженные в R2 открываются,
пока ключи R2 на месте (ключи не удалять).

**Перенос данных не нужен:** прод очищается командой `purge-test-data` (она теперь чистит и R2).
Уже загруженные официальные стикеры, подарки и аватары админов остаются в AWS и открываются оттуда:
у каждого файла в базе записан его бакет. Новые стикеры и подарки из админки и новые аватары (в том
числе админов, это аватар их аккаунта в приложении) после включения идут в R2.

**Необязательно:** Zone ID и токен Cache Purge в той же карточке. Тогда удалённое фото сразу
исчезает с края Cloudflare, а не через сутки.

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

## Откат домена
Namecheap → Nameservers → **Namecheap BasicDNS**. Старые записи в Namecheap
не удаляются, поэтому всё возвращается как было.

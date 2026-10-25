# AVIF images (owner 2026-10-25)

## Для владельца (5 строк)
1. Фото (аватары, фото постов/отзывов/дел) уже хранятся в WebP с размерами 256 / 320 / 1080 / 1024 / 2048 px. Теперь можно ещё и AVIF: файл меньше примерно на 40-50%.
2. Всё ВЫКЛЮЧЕНО по умолчанию. Включить: Админка → Настройки → `images.avif_enabled` = да, затем `images.avif_since` = текущее время (например `2026-10-26T00:00:00Z`).
3. AVIF получают только запросы с заголовком `X-Image-Formats: avif`. Нынешнее приложение его не шлёт, поэтому оно видит ровно то же, что и раньше. Внешний вид не меняется.
4. Старые фото не трогаются и читаются как раньше; AVIF-копии есть только у фото, загруженных после `images.avif_since`.
5. Стоимость: $0 (никаких Lambda и платных трансформаций), скорость не падает: копии готовятся при загрузке, не на лету.

## Research (2026-10-25)
Compared how the big stacks do it:
- AWS "Dynamic Image Transformation for Amazon CloudFront" (AWS Solutions guide, docs.aws.amazon.com/solutions/dynamic-image-transformation-for-amazon-cloudfront/): CloudFront + API Gateway + Lambda (sharp), normalises Accept/query in a CloudFront Function; AVIF supported. Needs a new CloudFormation stack plus Lambda/API Gateway/WAF costs, and first view of each size is a cold Lambda call (slower than a stored file). It also needs terraform/CloudFormation apply by the owner.
- Cloudflare Images transformations on R2 (developers.cloudflare.com/images/pricing/): 5,000 unique transformations/month free, then $0.50 per 1,000; works for R2-stored images; `format=auto` negotiates AVIF/WebP. Good fit for later when media lives on R2 behind a Cloudflare zone, but it is per-size billing and only covers the R2 side.
- Bunny Optimizer: flat monthly add-on per zone; not on our CDN.
- aws-samples/image-optimization (github.com/aws-samples/image-optimization): CloudFront Function + Lambda `format=auto`; same Lambda cost/latency trade-off.

Decision: the app already pre-renders a fixed responsive set at upload (sharp, in the scan worker), so the cheapest and never-slower way is to add one more pre-rendered format. No new infrastructure. The on-the-fly services stay the option if we ever need arbitrary sizes. Negotiation is by an explicit request header (not the browser `Accept`), because the Flutter client does not send `image/avif` and older phones cannot decode it.

## How it works
- Upload (`FileScanProcessor` + `ImageProcessor`): when `images.avif_enabled`, each size also gets a twin `<key>.avif`, `<key>_w320.avif`, ... stored next to the WebP/JPEG. An AVIF that is not smaller is dropped.
- Serving (`FilesService.imageLink`): the twin URL is returned only when the switch is on, the request has `X-Image-Formats: avif`, the purpose is a processed photo (avatar, post/review/case/chat/support photos) and the file is newer than `images.avif_since`. Otherwise the old link, unchanged.
- Cleanup: removing a file removes the twins too (`derivedKeys`). Dedup does not share an object that was stored before `avif_since`.
- No DB schema change, no DTO change, no contract regen.

## Settings (all have defaults)
| key | default |
|---|---|
| `images.avif_enabled` | false |
| `images.avif_since` | "" (serve none) |
| `images.avif_quality` | 60 (1-100) |
| `images.avif_effort` | 2 (0-9; higher = smaller, much slower) |
| `images.webp_quality` | 88 (as before) |
| `images.jpeg_quality` | 90 (as before) |

## Measurements (`node apps/api/bench/image-avif.mjs apps/mobile/assets/practice_art 60`, 8 real photos, sharp on a Mac)
See the PR description for the numbers table. Effort 4 gives ~2 points smaller files but ~10x slower encode, so the default is 2.

## Turning it on
1. Set `images.avif_enabled` = true and `images.avif_since` = now (ISO).
2. A client opts in by sending `X-Image-Formats: avif` (web: any browser; Flutter: needs a small change in the HTTP client, only for OS versions that decode AVIF: Android 12+, iOS 16+). Not done here: the app look is frozen.
3. Turn off: set `images.avif_enabled` = false; links go back to WebP at once.

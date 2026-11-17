# AVIF images (owner 2026-10-25)

## Для владельца (5 строк)
1. Фото (аватары, фото постов/отзывов/дел) уже хранятся в WebP с размерами 256 / 320 / 1080 / 1024 / 2048 px. Теперь можно ещё и AVIF: при том же качестве файл меньше примерно на 15 % (замер 16.11 ниже; прежние «40-50 %» были при качестве 60, а оно хуже WebP).
2. Всё ВЫКЛЮЧЕНО по умолчанию. Включить: Админка → Настройки → `images.avif_enabled` = да, затем `images.avif_since` = текущее время (например `2026-10-26T00:00:00Z`).
3. AVIF получают только запросы с заголовком `X-Image-Formats: avif`. Его шлёт только веб (все браузеры, где он работает, умеют AVIF); телефоны и админка его не шлют и видят WebP, как раньше. Внешний вид не меняется.
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
| `images.avif_quality` | 75 (1-100; was 60 until 16.11, see «Quality check 16.11») |
| `images.avif_effort` | 2 (0-9; higher = smaller, much slower) |
| `images.webp_quality` | 88 (as before) |
| `images.jpeg_quality` | 90 (as before) |

## Measurements (`node apps/api/bench/image-avif.mjs apps/mobile/assets/practice_art 60`, 8 real photos, sharp on a Mac)
See the PR description for the numbers table. Effort 4 gives ~2 points smaller files but ~10x slower encode, so the default is 2.

## Turning it on
1. Set `images.avif_enabled` = true and `images.avif_since` = now (ISO).
2. A client opts in by sending `X-Image-Formats: avif` (web: any browser; Flutter: needs a small change in the HTTP client, only for OS versions that decode AVIF: Android 12+, iOS 16+). Not done here: the app look is frozen.
3. Turn off: set `images.avif_enabled` = false; links go back to WebP at once.

## Quality check 16.11.2026 (row 202)

Same inputs, server settings, `sharp.concurrency(1)` (CPU of one core).
- **Tools:** sharp 0.35.5, libvips 8.18.7, aom 3.15.1, libheif 1.23.5. These are the newest: sharp 0.35.5 is the latest release, 27.09.2026.
- **Reference:** the lossless resized image.
- **Metrics:** SSIM (All) and PSNR by ffmpeg against the reference.
- **Inputs:**
  - a 4032 px phone JPEG q90 (landscape) cut to 2048, 1080 and 320, and to avatar squares 1024 and 256;
  - a smooth gradient at 1080 (banding check);
  - three real 800 px photos;
  - a 1080 px app screenshot with text.

| input | WebP q88 e4: bytes / SSIM / PSNR / CPU ms | AVIF q60 e2 (old default) | AVIF q75 e2 (new default) |
|---|---|---|---|
| landscape 2048 | 68710 / 0.9788 / 45.48 / 281 | 37277 / 0.9739 / 46.70 / 661 | 53723 / 0.9756 / 47.12 / 717 |
| landscape 1080 | 28112 / 0.9741 / 43.62 / 83 | 17527 / 0.9743 / 46.21 / 232 | 25087 / 0.9796 / 46.92 / 265 |
| landscape 320 | 6436 / 0.9668 / 39.97 / 10 | 4246 / 0.9710 / 43.46 / 26 | 5820 / 0.9793 / 44.70 / 29 |
| gradient 1080 | 56174 / 0.9542 / 41.03 / 106 | 37302 / 0.9592 / 42.27 / 268 | 53315 / 0.9652 / 43.38 / 289 |
| avatar 1024 | 25894 / 0.9746 / 43.46 / 75 | 16392 / 0.9736 / 46.20 / 212 | 23376 / 0.9785 / 46.89 / 235 |
| avatar 256 | 4990 / 0.9611 / 39.00 / 7 | 3367 / 0.9721 / 42.29 / 20 | 4518 / 0.9783 / 44.03 / 21 |
| photo animal 800 | 32784 / 0.9816 / 43.23 / 42 | 22207 / 0.9832 / 43.04 / 91 | 30821 / 0.9899 / 46.07 / 98 |
| photo civil 800 | 110428 / 0.9899 / 41.71 / 56 | 61211 / **0.9776 / 37.54** / 131 | 83453 / 0.9924 / 42.94 / 139 |
| photo agri 800 | 98936 / 0.9882 / 39.46 / 51 | 57670 / **0.9820 / 36.07** / 171 | 78158 / 0.9897 / 39.99 / 192 |
| screenshot text 1080 | 35380 / 0.9946 / 43.96 / 45 | 25473 / **0.9939 / 41.74** / 130 | 33843 / 0.9969 / 45.07 / 179 |
| **all** | 467 844 B, CPU 1× | 60 % of the bytes, but lower quality on 6 of 10 | **84 % of the bytes, CPU 2.9×** |

What the table shows:
- **q60 (the old default) is not WebP quality.** Detailed photos lose 4–5 dB PSNR. Text and fine detail get softer.
- **q75 is equal or better on 9 of 10 inputs.** The 10th is the smooth-sky 2048: SSIM −0.003 (sky grain, the metric is not monotonic there), PSNR +1.6 dB.
- AVIF from sharp is 4:4:4 by default, so text colours do not bleed. Asking for `chromaSubsampling:'4:4:4'` explicitly gives the same bytes.
- **Effort 4** saves about 10–20 % more, but costs 18× the CPU of WebP. Stay on 2.

Display check:
- **Chromium 152:** the browser pane, and WebCodecs `ImageDecoder`, which is the path Flutter web uses on Blink.
- **Apple ImageIO:** the decoder Safari uses (checked through `sips`).
- **Other browsers:** Flutter web outside Blink decodes through the browser's own image element (`flutter_web_sdk/.../canvaskit/image.dart`, `decodeBlobToCkImage`). So Safari 16+ and Firefox show AVIF too.
- **Phones and the admin** do not send the header and keep getting WebP.

Cost when it is switched on:
- About 2.9× the CPU of the photo encodes on the worker. When cores are free, the twin runs in parallel (`atOnce`).
- About +84 % storage for public photos that have a twin.

Switching on is the owner's call in the admin: `images.avif_enabled` = да and `images.avif_since` = now.

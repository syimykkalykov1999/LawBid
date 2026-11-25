---
id: feed-ranker
title: Умная лента — обученные ранжировщики постов, рилсов и кейсов
category: system
cost: Бесплатно (обучение на своём компьютере, каждая модель весит несколько КБ в S3)
time: 30 минут на каждую ленту
verified: 2026-11-25
sources:
  - Instagram Engineering: Journey to 1000 models (май 2025) | https://engineering.fb.com/2025/05/21/production-engineering/journey-to-1000-models-scaling-instagrams-recommendation-system/
  - TikTok Newsroom: How TikTok recommends videos #ForYou (18.06.2020) | https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you
  - Google: Deep Neural Networks for YouTube Recommendations (RecSys 2016) | https://research.google/pubs/deep-neural-networks-for-youtube-recommendations/
  - Airbnb: Applying Deep Learning to Airbnb Search (KDD 2019) | https://arxiv.org/abs/1810.09591
  - Twitter: the-algorithm, отбор кандидатов и тяжёлый ранжировщик (2023) | https://github.com/twitter/the-algorithm
  - LightGBM: LGBMRanker (lambdarank) | https://lightgbm.readthedocs.io/en/stable/pythonapi/lightgbm.LGBMRanker.html
  - ONNX Runtime Web | https://onnxruntime.ai/docs/get-started/with-javascript/web.html
---

## Что это и зачем

Три ленты подбираются под человека в два шага, как у Instagram, TikTok и
YouTube: сначала формула отбирает кандидатов, потом обученная модель
расставляет лучших заново. У каждой ленты своя модель, свои признаки и
свой выключатель:

| Лента | Где в приложении | Чему учится модель | Настройки |
|---|---|---|---|
| Посты | Поиск → Посты → «Для вас» | сохранил, лайкнул, открыл | `reco.ranker.*` |
| Рилсы | Лента → Рилсы и любое открытие рилса | отправил, сохранил, лайкнул, смотрел больше 3 секунд | `reco.ranker.reels.*` |
| Кейсы | Лента → Кейсы и Поиск → Кейсы (адвокат) | наняли, сделал ставку, открыл | `reco.ranker.cases.*` |

Лента «Кейсы» модель только переставляет: какие кейсы адвокату видны,
решают те же правила, что и раньше (штат, лицензия, квалификация). О
клиенте модель не знает ничего (ни имени, ни пола, ни возраста, ни
языка) — только тема, штат, свежесть, бюджет, сколько ставок, срочность,
рейтинг клиента и была ли уже ставка этого адвоката.

Все три выключателя стоят на «Авто». Пока модели нет, у всех формула, как
сейчас. В «Авто» модель включается сама, только если на проверке она была
лучше формулы и считает быстрее порога.

## Когда начинать

Журнал показов в режиме «Авто» (`ranking.events_mode`) теперь пишется и
тогда, когда хоть один ранжировщик не «Выкл»: модели нужны показы, чтобы
учиться. Пишется доля людей из `ranking.impression_sample_percent`.
Нужно несколько недель показов; программа сама скажет «Not enough data
yet», если данных мало, и ничего не создаст.

## Шаги владельца

1. **Подготовка (один раз, на компьютере).** В папке проекта:
   `cd ml/feed-ranker`, затем
   `python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt`
   (на Mac перед этим `brew install libomp`).
2. **Обучение — отдельно для каждой ленты** на копии базы только для
   чтения (read replica):
   - посты: `python train.py --feed posts --dsn "<адрес read replica>" --days 30 --out out`
   - рилсы: `python train.py --feed reels --dsn "<адрес read replica>" --days 30 --out out`
   - кейсы: `python train.py --feed cases --dsn "<адрес read replica>" --days 30 --out out`

   Каждый запуск пишет, лучше ли модель формулы (NDCG@10), куда положить
   файлы и какую настройку поменять.
3. **Загрузка в S3.** AWS Console → S3 → бакет документов → **Create
   folder** и **Upload** обоих файлов `model.onnx` и `manifest.json` из
   `out/<версия>/`:
   - посты: в `ml/feed-ranker/<версия>/`
   - рилсы: в `ml/feed-ranker/reels/<версия>/`
   - кейсы: в `ml/feed-ranker/cases/<версия>/`
4. **Включение.** Админка → Настройки:
   - `reco.ranker.model_key` / `reco.ranker.reels.model_key` /
     `reco.ranker.cases.model_key` = путь из шага 3 (например
     `ml/feed-ranker/reels/r202612011530/model.onnx`);
   - режим оставить `auto` (по умолчанию) или поставить `on`;
   - доля людей в тесте (`…traffic_percent`) — 10 для начала.
5. Через неделю сравните группы теста (model — модель, control — формула):
   `python train.py --feed reels --report --dsn "<адрес read replica>" --days 7`
   (так же для `posts` и `cases`). Если у model доля кликов выше и
   интервалы не пересекаются, поднимайте `…traffic_percent`.
6. **Выключить в любой момент:** режим нужной ленты = `off` — у всех сразу
   формула (за 15 секунд). Остальные ленты не меняются.

## Что проверяется само

- Модель другой ленты или с другим набором признаков не загружается: у
  всех формула. Модель рилсов не встанет в посты и наоборот.
- Испорченный файл (не совпала контрольная сумма) не загружается.
- В режиме `auto`: если модель считает дольше порога
  `…latency_budget_ms`, на 5 минут снова формула.
- Если S3 недоступен, страницы не ждут: формула.

## Как проверить

1. Админка → Настройки: у трёх строк `reco.ranker.mode`,
   `reco.ranker.reels.mode`, `reco.ranker.cases.mode` стоит `auto`.
2. Откройте Поиск → Посты → «Для вас»: порядок уже не «сначала новые» —
   посты подобраны под человека (так было задумано, но до 25.11 Поиск
   этот порядок не получал).
3. После загрузки модели: с тестового аккаунта из группы `model` порядок
   рилсов (или кейсов) отличается от порядка у аккаунта из `control`.
4. `python train.py --feed reels --report --dsn "<адрес read replica>" --days 1` —
   у обеих групп растут показы, у `model` указана версия `ranker:<версия>`.
5. Поставьте режим ленты `off` — через 15 секунд у всех снова порядок по
   формуле.

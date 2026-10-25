---
id: cdn-cache-invalidation
title: Очистка CDN при удалении фото и отдельный Redis для кэша
category: aws
cost: Очистка CDN — первые 1000 путей в месяц бесплатно, дальше около 0,5 цента за путь (в админке стоит предел). Отдельный Redis для кэша — небольшая месячная плата за один маленький узел.
time: 20-30 минут
verified: 2026-10-25
sources:
  - AWS: Invalidate files to remove content | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation.html
  - AWS: CloudFront pricing | https://aws.amazon.com/cloudfront/pricing/
  - Репозиторий: docs/runbooks/redis.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/redis.md
---

## Что это и зачем

Фото и файлы лежат на серверах CDN (CloudFront) до года. Если фото удалили (жалоба, удаление аккаунта), его копия на CDN могла оставаться доступной. Теперь удаление ставит «путь» в очередь, и раз в две минуты пачка уходит в CloudFront на очистку. Один путь на файл, вместе с его уменьшенными копиями и AVIF.

Второе: кэши отдельных людей (первая страница ленты, список блокировок, права по тарифу) теперь пишутся в отдельный Redis, который сам выкидывает старое, а не в тот, где живут очереди. Без этого при миллионах людей кэш мог заполнить очередь.

## Что понадобится

- Доступ к `infra/envs/prod` и вход в AWS (см. гайд «Terraform plan и apply через наши скрипты»).

## Шаги

1. В файле `terraform.tfvars` в `infra/envs/prod` поставьте `redis_cache_node = true` (маленький узел, `redis_cache_node_type` можно оставить по умолчанию).
2. Выполните `plan` и прочитайте итог. Ожидаемое: новый узел Redis для кэша, новые переменные `CLOUDFRONT_MEDIA_DISTRIBUTION_ID` и `CLOUDFRONT_PRIVATE_DISTRIBUTION_ID` у API, право `cloudfront:CreateInvalidation` для задачи API, `http_version = http2and3` у двух CDN, срок кэша приватных файлов на CDN 1 час.
3. Если в плане нет ничего неожиданного, скажите Claude «да, apply».
4. После apply откройте **Admin → Настройки** и проверьте пункты «cdn.invalidate_*»: режим auto, пачка 500, предел в сутки 500 и в месяц 5000.
5. Проверка: удалите тестовое фото (например, через жалобу на тестовый аккаунт), через 2-3 минуты в **AWS → CloudFront → Invalidations** нужной раздачи появится запись с путём вида `/avatar/.../*`.

## Как понять, что всё работает

В CloudFront у раздачи медиа во вкладке **Invalidations** есть записи со статусом **Completed**. Ссылка на удалённое фото теперь отвечает ошибкой, а не картинкой.

## Если что-то пошло не так

- Записей нет: проверьте, что у API задан `CLOUDFRONT_MEDIA_DISTRIBUTION_ID` (в **ECS → задача API → переменные**). Без него очистка просто не запускается, фото тогда устареет само.
- В логах «CloudFront invalidation failed»: значит у задачи нет права `cloudfront:CreateInvalidation`; повторите `apply`.
- Платных путей слишком много: уменьшите «Предел путей очистки CDN в месяц». При превышении копия просто устареет сама, ничего не ломается.
- Отключить всё сразу: поставьте `cdn.invalidate_on_delete` = off в **Admin → Настройки**. Вернуть кэши в основной Redis: `cache.redis_mode` = off.

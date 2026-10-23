# LiveKit: свой сервер групповых звонков (SFU)

> **Для владельца:** сейчас ничего не создано и ничего не стоит
> (`livekit_enabled = false`). Включаете одной строкой в `tfvars`, когда
> приложение (API + мобильное) готово ходить в LiveKit. Код: `infra/modules/livekit`.

Зачем: звонок 1 на 1 идёт напрямую или через TURN ([TURN.md](TURN.md)). Для
групповых звонков (3+ человека) нужен SFU: каждый шлёт видео один раз,
сервер раздаёт остальным. Берём открытый `livekit/livekit-server`
(Apache-2.0), на своём сервере AWS, без платных сторонних сервисов.

## Что создаётся

| Что | Размер | ≈ в месяц (us-east-1) |
|---|---|---|
| EC2 `c7g.medium` (Graviton, 1 vCPU, 2 ГБ) | `livekit_instance_type` | $26 |
| Публичный адрес (Elastic IP) | | $3.7 |
| Диск 20 ГБ | | $1.6 |
| 4 сигнала CloudWatch | | $0.4 |
| Redis | общий с приложением (база №1) | $0 |
| **Итого без трафика** | | **≈ $32** |
| Исходящий трафик | $0.09 за ГБ (первые 100 ГБ в месяц на весь аккаунт бесплатно) | зависит от звонков |

Оценка трафика: видео 720p ≈ 1.5 Мбит/с ≈ 0.7 ГБ в час на одного
получателя. Группа из 4 человек на час ≈ 4 × 3 × 0.7 ≈ 8 ГБ ≈ $0.75.
100 таких часов в месяц ≈ $75. Сигнал `…-livekit-egress` приходит, если за
сутки ушло больше `livekit_egress_alarm_gb_per_day` (50 ГБ ≈ $4.5/сутки).

Один `c7g.medium` по порядку величины тянет десятки одновременных
участников (LiveKit упирается в процессор и сеть). Сигнал
`…-livekit-cpu` (> 70 % полчаса) говорит, что пора расти.

## Как устроено

По схеме официальной инструкции LiveKit «Deploy to a VM»
(docs.livekit.io/transport/self-hosting/vm): на сервере два контейнера.
`livekit-server` (образ закреплён: `v1.13.10`, есть arm64) и Caddy
(`livekit/caddyl4`), который сам получает и обновляет сертификаты Let's
Encrypt. Сертификат ACM здесь не подходит: его нельзя вынуть на обычный
EC2, он работает только за балансировщиком ($16+ в месяц).

| Порт | Зачем |
|---|---|
| 443/tcp | `wss://livekit.<домен>` (сигнал) и TURN поверх TLS (`livekit-turn.<домен>`), Caddy раскладывает по имени |
| 80/tcp | выпуск сертификата |
| 7881/tcp | WebRTC по TCP (запасной путь) |
| 3478/udp | TURN/STUN встроенный |
| 50000–60000/udp | медиа WebRTC |

SSH нет, вход через Session Manager. Redis: LiveKit со своей базой №1 в том
же ElastiCache, паролем из секрета `REDIS_URL`. Один узел работает и без
Redis, но с ним узлов можно добавлять (см. «Как расти»).

Ключи: `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` генерирует Terraform и кладёт
в Secrets Manager (`lawbid-prod/LIVEKIT_*`), вместе с `LIVEKIT_URL =
wss://livekit.<домен>`. Все три сразу подставляются в задачи API и worker
(не надо добавлять в `extra_secrets`).

## Шаги владельца

1. В `terraform.tfvars` (на Mac, в `infra/envs/prod`): `livekit_enabled = true`.
2. `terraform init -backend-config=backend.hcl`, затем
   `terraform plan -var-file=launch.tfvars.example -var-file=terraform.tfvars`.
   В плане должно быть только добавление (EC2, адрес, группа безопасности,
   роль, 3 секрета, сигналы, правило доступа в Redis) и **новая версия
   задач API/worker** (в них добавились три переменные); `0 to destroy`.
3. `terraform apply`, `yes`.
4. `terraform output -json stack | jq .livekit_public_ip` (или
   `livekit_dns_names`). В Namecheap → Advanced DNS добавить **две**
   A-записи на этот адрес: хост `livekit` и хост `livekit-turn`, TTL
   Automatic. (Если `hosted_zone_id` задан, Terraform создаст их сам.)
5. Подождать 2–5 минут: Caddy сам выпустит сертификаты. Проверка:
   `curl -I https://livekit.lawbid.dev` отвечает (любой код, не ошибка TLS).
6. Включить групповые звонки в приложении (когда выйдет сборка с поддержкой).

## Если не работает

Session Manager на сервер: `sudo journalctl -u livekit -n 80`,
`sudo journalctl -u livekit-caddy -n 80`, `sudo docker ps`.
- Caddy пишет про сертификат: нет DNS-записей из шага 4 или закрыт порт 80.
- LiveKit не стартует из-за Redis: проверьте в `journalctl`; временный
  выход — `livekit_use_redis = false` (один узел работает без Redis).
  Если ошибка про проверку TLS Redis, это значит, что в образе нет
  корневых сертификатов: поставьте в `user-data.sh.tftpl` `insecure: true`
  (внутри сети VPC, трафик остаётся шифрованным).
- Сервер сломался: сигнал `…-livekit-system-status` сам просит AWS его
  восстановить; адрес остаётся тот же.
- Новая версия LiveKit: меняется `livekit_image` (в `modules/livekit`
  default), `apply` пересоздаёт сервер (адрес остаётся; звонки
  переподключатся за минуту).

## Как расти (несколько узлов)

1. Вертикально: `livekit_instance_type = "c7g.large"` (≈ $52) или
   `c7g.xlarge`; `apply` пересоздаёт сервер (~1 минута простоя).
2. Горизонтально (LiveKit в режиме Redis, клиент может прийти на любой
   узел, комнаты распределяются): второй такой же сервер в другой зоне.
   Нужен код: вынести `aws_instance` в `count`/`for_each` по подсетям,
   по одному Elastic IP на узел и DNS `livekit.<домен>` с несколькими
   A-записями (или Route 53 multivalue с проверками, как у TURN) либо NLB
   (TCP 443 + UDP 3478, `external_tls` на стороне NLB) — это отдельная
   работа ≈ полдня, делается, когда сигнал CPU приходит регулярно. Ключи и
   Redis уже общие. Для больших нагрузок LiveKit в Kubernetes с
   автомасштабированием (официальный Helm-чарт) — отдельное решение.
3. Не забыть поднять `monthly_budget_usd`, если трафик вырос.

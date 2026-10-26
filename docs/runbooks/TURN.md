# Calls: Cloudflare TURN (our own coturn is removed)

**Status 2026-10-24.** Our own coturn servers were deleted from AWS
(`turn_enabled = false`, `turn_second_enabled = false`). 1:1 calls relay through
**Cloudflare Realtime TURN**; group calls use the **Cloudflare SFU** when
`calls.video_provider = cloudflare`. Nothing runs on EC2 for calls any more.

## What runs now

- Keys: admin -> Integrations -> `cloudflare_turn` (`keyId`, `apiToken`), or the env
  `CLOUDFLARE_TURN_KEY_ID` / `CLOUDFLARE_TURN_API_TOKEN`. Group calls: `cloudflare_sfu`.
- `GET /calls/ice-servers` asks Cloudflare for a 24 h login per user (cached 30 min), and
  puts it first, then STUN. Code: `apps/api/src/modules/calls/cloudflare-turn.ts`.
- If Cloudflare does not answer, the API retries once after 300 ms (1.5 s limit). Still
  nothing: the call goes on with STUN only (and our own TURN **only when** it is still
  configured). The failure is counted as `turnProviderFailed` in the one-a-minute `slo`
  log line; 5 in 5 minutes page `<env>-turn-provider-failed`. API logs: search
  `cloudflare_turn_failed`.
- While Cloudflare works, any old `TURN_URLS` / admin TURN entry is **ignored** on purpose
  (dead IPs make ICE wait for timeouts) and the API logs one warning an hour. Clear it:
  admin -> Integrations -> TURN.
- The «video call» button counts `cloudflare_turn` keys as a configured provider.
- Admin -> Система -> Состояние системы shows **Cloudflare TURN**, **Cloudflare SFU** and
  **Cloudflare R2** (each probe is one tiny real request, cached 2 min; grey when unused;
  the watchdog pages after two red checks in a row). The old «own TURN» row stays grey.

## If a call alarm fires

1. Admin -> Состояние системы -> Cloudflare TURN / SFU. Red = Cloudflare refused us:
   check the key (Integrations -> `cloudflare_turn` -> «Проверить») and
   https://www.cloudflarestatus.com.
2. API logs: `cloudflare_turn_failed` (HTTP status in the message: 401 = key revoked,
   429/5xx = Cloudflare side).
3. A new key: Cloudflare dashboard -> Realtime -> TURN -> create key -> paste into the
   admin. No deploy needed.

## Cloudflare TURN facts (developers.cloudflare.com/realtime/turn)

- Price: **$0.05 per GB** sent from the Cloudflare edge to the client, the first **1 000 GB
  a month are free**. STUN (`stun.cloudflare.com`) is free. Traffic between TURN and the SFU
  is not charged.
- A login may live up to 48 h; we issue 24 h. Cloudflare may change TURN IPs: we never
  hard-code them (the login response lists names).
- Port 53 URLs are removed (browsers block them and ICE stalls).
- Allocations can be disturbed by maintenance; Cloudflare advises clients to support ICE restart.

## SFU sessions at the end of a call

Cloudflare Realtime SFU API (calls-api-2024-05-21.yaml) has `sessions/new`,
`tracks/new`, `tracks/close`, `renegotiate`, data channels and `GET sessions/{id}`.
It has **no endpoint that closes or deletes a session**. So at the end of a call
(finish, leave, kick, silence sweep) the API closes the person's **tracks**
(`SfuBrokerService.closeCall` / `cleanupUser`, force-close) and forgets its own state;
the empty session expires on Cloudflare's side by itself. Nothing is billed for an
idle session (SFU is billed by egress GB, first 1 000 GB free). Nothing to do for the owner.

## How others do it (research notes, 2026-10-24)

- **Cloudflare's own guidance:** fetch short-lived credentials server-side per user, never
  hard-code relay IPs, support ICE restart. We do exactly this.
- **LiveKit / Jitsi / Matrix:** the ICE-server list is built by the server and handed to the
  client; the client tries every candidate (UDP -> TCP -> TURN/TLS 443) and the browser
  picks the first pair that works. Operators keep **two independent relays** (their own
  plus a managed one) so that one failure only delays a call. Our equivalent: Cloudflare
  first, STUN second; our coturn can be added back as the second relay (below).
  Health: these projects check relays with a synthetic allocation (trickle-ICE style
  test), not a TCP ping. Cloudflare publishes no health endpoint, so our probe really
  requests a login (what a call does) and caches it for 2 minutes.
- **Why a dead server must not stay in the list:** every candidate pair waits for its
  timeout; one dead relay slows every call. Hence: no own TURN while Cloudflare works.

## Bringing our own coturn back (only if ever needed)

1. `infra/envs/prod/terraform.tfvars`: `turn_enabled = true` (and, for a second zone,
   `turn_second_enabled = true`). Cost about $7-8 a month per server plus traffic.
2. Follow sections 1-4 below (apply, DNS `turn` A-records in Cloudflare DNS now, secret,
   admin -> Integrations -> TURN). Because Cloudflare still works, the API **ignores** the
   TURN entry until Cloudflare fails; to make it a permanent second relay, tell the
   developer (a code switch; today the rule is «Cloudflare ok = no own TURN»).
3. Remove `turn_*` alarms from your inbox rules if you remove it again.

The rest of this file describes the old coturn setup (kept for that case).

---

# TURN server for calls (coturn)

Without a TURN relay calls between phones behind carrier NAT do not connect
(STUN alone is not enough). One small coturn on EC2, ≈ $7–8/month
(t4g.nano ≈ $3 + public IPv4 ≈ $3.6 + traffic; prod now runs t4g.small, see «Размер сервера» below). Code: `infra/modules/turn`.
Second relay in another zone and alarms: section «Два сервера» below.
The API needs no change: `calls.service.ts` issues short-lived logins from the
URL list and the secret (admin → Интеграции → TURN).

## 1. Apply (owner, on the Mac, only this module)

```
cd ~/Desktop/LawBid/infra/envs/prod && eval "$(aws configure export-credentials --format env)" && terraform init -backend-config=backend.hcl && terraform apply -target=module.stack.module.turn -var-file=launch.tfvars.example
```

Expected: the plan adds only `module.stack.module.turn[0]` resources
(instance, Elastic IP, security group, IAM role, SSM parameter): 0 to destroy.
Type `yes`. Run `terraform output stack` afterwards and copy `turn_public_ip`.

## 2. DNS (Namecheap → lawbid.dev → Advanced DNS)

Add: Type `A Record`, Host `turn`, Value = the `turn_public_ip` from step 1,
TTL Automatic. Check in a few minutes: `dig +short turn.lawbid.dev`.

## 3. Read the secret (never in git or in logs)

```
aws ssm get-parameter --region us-east-1 --name /lawbid-prod/turn/static-auth-secret --with-decryption --query Parameter.Value --output text
```

## 4. Admin → Интеграции → TURN

- urls: `turn:turn.lawbid.dev:3478?transport=udp,turn:turn.lawbid.dev:3478?transport=tcp`
- secret: the value from step 3
- STUN: leave as is
Save. Takes effect on the next call, no deploy and no new app build.

## Check

On a phone over mobile data call a phone on another network. Server side
(Session Manager on the instance): `sudo journalctl -u coturn -n 50` shows
`allocation` lines while a call is live.

## Notes

- The instance has no SSH; use Systems Manager → Session Manager.
- Relay is blocked from private ranges (VPC, 10/8, 172.16/12, 192.168/16),
  so it cannot be used as a proxy into our network.
- TLS on 5349 (for networks that block UDP and 3478) is a second step: a
  Let's Encrypt certificate for `turn.lawbid.dev` on the instance; the port
  is already open. Not required for the first release.
- Changing the secret or address replaces the instance (Elastic IP stays).
- Video calls stay off (`video_calls` flag) until TURN is checked.

## Два сервера (2026-10-22): второй TURN в другой зоне

Один сервер TURN = точка отказа: упал, и у людей за мобильным NAT звонки не
соединяются. `turn_second_enabled = true` создаёт второй coturn в другой
Availability Zone (отдельный адрес, тот же секрет, та же группа
безопасности). Значения «urls» и «secret» в админке **не меняются**:
`turn.lawbid.dev` теперь указывает на оба адреса, а браузер/телефон при
недоступности первого пробует второй.

Цена: второй t4g.nano ≈ $7.4 (сервер $3 + адрес $3.7 + диск $0.6) +
проверки Route 53 на оба сервера ≈ $1.5 + сигналы ≈ $0.7 → **≈ +$10 в месяц**
(включая проверки для первого сервера).

Шаги:
1. `turn_second_enabled = true` в `terraform.tfvars`.
2. `terraform plan`, затем `apply`: появятся второй сервер, сигналы в общую
   тему алертов и проверки Route 53; уничтожений 0.
3. `terraform output -json stack | jq .turn_public_ips` показывает два
   адреса. В Namecheap у хоста `turn` должно быть **две** A-записи (старая
   и новая), TTL Automatic. Если `hosted_zone_id` задан, Terraform ведёт
   записи сам (multivalue answer: нездоровый сервер сам пропадает из
   ответа). `dig +short turn.lawbid.dev` показывает оба адреса.
4. Проверка: звонок по мобильной сети; на каждом сервере (Session Manager)
   `sudo journalctl -u coturn -n 20`.

Сигналы (в общую тему алертов, на почту):
- `…-turn-primary|second-health`: проверка Route 53 на порт 3478 не прошла
  2 минуты (только `us-east-1`; в других регионах проверки отключаются).
- `…-system-status`: сбой хоста AWS; AWS сам восстанавливает сервер (адрес
  остаётся) и присылает письмо. `…-instance-status`: не отвечает ОС 5 минут,
  в Session Manager `sudo systemctl restart coturn`.
- `…-turn-traffic`: серверы вместе отправили больше
  `turn_traffic_alarm_gb_per_day` (20 ГБ, ≈ $1.8) за сутки.

### Трафик

Весь голос и видео, которые не нашли прямой путь, идут через TURN и
оплачиваются ($0.09 за ГБ исходящего, первые 100 ГБ в месяц на аккаунт
бесплатно). Видеозвонок 720p ≈ 0.7 ГБ в час на одного. Если сигнал
пришёл без роста числа звонков: в `journalctl -u coturn` ищите один и тот
же логин с множеством выделений (злоупотребление). Логины живут минуты;
чтобы отрезать злоумышленника, смените секрет:
`terraform apply -replace=module.stack.module.turn[0].random_password.secret`
(серверы пересоздаются, адреса остаются), затем новый секрет в админке. Порог можно поднять, когда звонков станет больше.

## Размер сервера, лимит звонков и сигналы (2026-10-23)

Сервер TURN пропускает через себя только звонки, которым не удалось
соединиться напрямую (строгий NAT, мобильные операторы, офисный Wi-Fi). У
маленького `t4g.nano` очень малый **постоянный** сетевой предел (≈ 32 Мбит/с;
короткие всплески выше), поэтому видео через него задохнулось бы раньше, чем
кончится лимит `total-quota`. Теперь размер задаёт и лимит.

### Лестница (на один сервер; серверов два, итого вдвое больше)

Правило: звук ≈ 0,1 Мбит/с, видео ≈ 1,5 Мбит/с, расчётная смесь 90 % звук /
10 % видео ≈ 0,25 Мбит/с на «выделение». Лимит ≈ постоянный сетевой предел
сервера / 0,25, округлённый вниз. Одно «выделение» ≈ половина звонка (звонок
через TURN занимает два).

| Размер (`turn_instance_type`) | Лимит (`total-quota`) | Цена сервера в месяц (≈, us-east-1, список) |
|---|---|---|
| `t4g.nano` | 100 | ≈ $3,1 |
| `t4g.micro` | 200 | ≈ $6,1 |
| **`t4g.small` (prod сейчас)** | **500** | ≈ $12,3 |
| `t4g.medium` | 1000 | ≈ $24,5 |
| `t4g.large` | 2000 | ≈ $49 |
| `c6gn.large` / `c7gn.large` | 2000 | ≈ $45 / $52 (сеть 3–6 Гбит/с, без кредитов) |
| `c6gn.xlarge` / `c7gn.xlarge` | 4000 | ≈ $90 / $104 |

Цены приблизительные, смотрите страницу цен EC2. Лимит можно задать вручную
(`turn_total_quota = 800`), иначе он берётся из размера (таблица в
`infra/modules/turn/main.tf`, `local.sizes`). `bps-capacity` оставлен 0: число
выделений уже ограничено, а лимит скорости ударил бы по всем звонкам сразу.

### Смена размера: как выкатывать (два сервера не перезапускать разом)

Смена размера или лимита меняет настройки на сервере, поэтому Terraform
**пересоздаёт** серверы (адреса Elastic IP остаются, ~2–3 минуты без сервера,
идущие через него звонки перенеговариваются или обрываются). Если сделать
один обычный `apply`, оба сервера уйдут одновременно, поэтому по шагам:

1. `terraform plan` и убедиться, что меняются только серверы TURN, сигналы и политика IAM.
2. Сначала второй: `terraform apply -target='module.stack.module.turn[0].aws_instance.second[0]' -target='module.stack.module.turn[0].aws_eip_association.second[0]' -var-file=launch.tfvars.example`.
3. Подождать 5 минут: письмо `…-turn-second-health` должно прийти в состояние OK (или не приходить); `sudo journalctl -u coturn -n 20` на новом сервере.
4. Потом обычный `terraform apply` (пересоздаст первый, второй уже готов и принимает звонки). Ночью, в часы малых звонков, лучше всего.

Без второго сервера (`turn_second_enabled = false`) короткий перерыв
неизбежен.

### Сигналы «скоро предел» (приходят на ту же почту, что и остальные тревоги)

Почты берутся из `alert_emails` в `terraform.tfvars` (тема SNS `lawbid-prod-alerts`,
письмо «Subscription confirmation» нужно подтвердить один раз). Для
каждого сервера (`primary`, `second`):

- `…-turn-<сервер>-network`: трафик выше 70 % постоянного предела 10 минут.
- `…-turn-<сервер>-cpu`: процессор выше 70 % 10 минут.
- `…-turn-<сервер>-cpu-credits`: у `t4g` кончается запас процессора (меньше 20).
- `…-turn-<сервер>-allocations`: занято больше 70 % от `total-quota` 10 минут.
  Число берёт сам сервер раз в минуту (таймер `turn-report`, считает занятые
  UDP-порты 49152–65535, метрика `LawBid/TURN → Allocations` в CloudWatch).
  Если метрики нет (сервер новый первые 2 минуты, таймер остановлен), тревога
  молчит, но тогда сработают сигналы здоровья.

Что делать, когда пришло письмо (любое из четырёх): посмотреть в CloudWatch,
не разовый ли это всплеск; если письмо приходит снова в часы пик или
вместе с ростом числа звонков, поднять `turn_instance_type` на ступень выше по
таблице (см. выше). Если звонков стало не больше, а трафик растёт, смотрите
«Трафик» (возможное злоупотребление).

### Что отдаёт API клиентам

`GET /calls/ice-servers` возвращает адреса из админки (Интеграции → TURN →
urls). Там один адрес `turn.lawbid.dev`, за ним два A-записи (Route 53
multivalue answer при `hosted_zone_id`, иначе две записи в Namecheap): клиенты
получают их в разном порядке, так звонки делятся между серверами, а упавший
сервер пропадает из ответа. Менять код API не нужно. Если когда-нибудь
понадобится жёсткое распределение, можно перечислить в `urls` оба адреса
напрямую, но тогда DNS-имя и проверки здоровья обойдутся.

### Рост выше (кратко)

Около 100 тыс. DAU: `c6gn.large`/`c7gn.large` и лимит 2000 на сервер.
Около 1 млн: добавить внешний управляемый TURN как запасной (Cloudflare
Realtime TURN или Twilio Network Traversal Service) в список серверов, а
групповые звонки уводить в LiveKit (`LIVEKIT.md`). Подробно с шагами:
`apps/admin/content/growth-plan.ru.md`.

## Cloudflare TURN (2026-10-24)

Звонки сначала идут через ретрансляторы Cloudflare Realtime TURN. Цена: оплата
за трафик, $0.05 за ГБ, первые 1000 ГБ в месяц бесплатно. Наши серверы coturn
остаются запасными: приложение получает сначала серверы Cloudflare, потом наши.
Если Cloudflare не ответил за 3 секунды или вернул ошибку, API пишет
предупреждение в лог и отдаёт только наши серверы, звонок не ломается.

Как включить (владелец):

1. Cloudflare (dash.cloudflare.com) → Realtime → TURN Server → Create. Дайте
   ключу имя, например `lawbid-calls`.
2. Cloudflare покажет **Key ID** и **API Token** (токен виден один раз,
   скопируйте оба).
3. Админка → Интеграции → «Cloudflare TURN (звонки в приложении)»: вставьте
   Key ID и API-токен → «Сохранить» → «Проверить» → «Включить».
4. Нашу карточку «TURN / STUN» не удаляйте: это запасной путь.

API-токен остаётся на сервере, в приложение уходят только временные логин и
пароль на 24 часа (на одного пользователя они кэшируются на 30 минут). Чтобы
выключить Cloudflare, очистите ключи в карточке.

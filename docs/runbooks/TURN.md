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

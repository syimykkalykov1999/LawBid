# TURN server for calls (coturn)

Without a TURN relay calls between phones behind carrier NAT do not connect
(STUN alone is not enough). One small coturn on EC2, ≈ $7–8/month
(t4g.nano ≈ $3 + public IPv4 ≈ $3.6 + traffic). Code: `infra/modules/turn`.
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

---
id: dns-firewall
title: Фильтр исходящих адресов серверов (DNS Firewall)
category: system
cost: $1–15 в месяц (оценка; $0,60 за миллион DNS-запросов + журнал в CloudWatch)
time: 15 минут на включение, через 2 недели 10 минут на разбор журнала
runbook: dns-firewall.md
verified: 2026-11-26
sources:
  - AWS Route 53: DNS Firewall rule groups and rules | https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-groups.html
  - AWS Route 53: DNS Firewall VPC configuration (fail-open) | https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-vpc-configuration.html
  - AWS Route 53: цены | https://aws.amazon.com/route53/pricing/
---

## Что это и зачем

Серверы API ходят в интернет к Stripe, Twilio, Bunny, R2, Sentry, к пушам Apple и Google и к реестрам адвокатов. Сейчас им можно ходить куда угодно. Если в какую-то библиотеку попадёт вредный код, он сможет отправить данные на чужой адрес. DNS Firewall (служба AWS) пропускает только адреса из нашего списка.

Сначала фильтр работает в режиме «только журнал» (ALERT): ничего не блокирует, а записывает чужие адреса. Через две недели по журналу решаем, включать ли блокировку (BLOCK). Если сама служба сломается, запросы пройдут: приложение из-за фильтра не упадёт.

## Что понадобится

- Mac с Terraform и вход в AWS (как для обычного `terraform apply`).
- Файл `infra/envs/prod/terraform.tfvars` (он есть только у вас).

## Шаги

1. Откройте `infra/envs/prod/terraform.tfvars` и добавьте строку `dns_firewall_enabled = true`.
2. В папке `infra/envs/prod` выполните `terraform plan`. Должны появиться только новые ресурсы `module.stack.module.dns_firewall`, ничего не удаляется.
3. Выполните `terraform apply`.
4. Через 2 недели откройте **CloudWatch → Logs Insights**, выберите группу `/aws/route53resolver/lawbid-prod` и выполните запрос из инструкции `docs/runbooks/dns-firewall.md`. Пришлите список адресов Claude.
5. Блокировку (`dns_firewall_mode = "BLOCK"`) не включайте, пока не решено, как работают превью ссылок: их адреса дают сами люди.

## Как проверить

- **AWS Console → VPC → DNS Firewall → Rule groups**: есть группа `lawbid-prod-egress` с двумя правилами, она привязана к VPC прода.
- **CloudWatch → Log groups → `/aws/route53resolver/lawbid-prod`**: через несколько минут появляются записи.
- Приложение и сайт работают как раньше: вход, сообщения, оплата, фото и видео.
- Откат: `dns_firewall_enabled = false` и `terraform apply`.


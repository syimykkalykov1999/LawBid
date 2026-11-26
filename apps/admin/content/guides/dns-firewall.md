---
id: dns-firewall
title: Фильтр исходящих адресов серверов (DNS Firewall)
category: system
cost: $1–15 в месяц (оценка; $0,60 за миллион DNS-запросов + журнал в CloudWatch)
time: 2 минуты (кнопка и код 2FA), через 2 недели 10 минут на разбор списка
runbook: dns-firewall.md
verified: 2026-11-26
sources:
  - AWS Route 53: DNS Firewall rule groups and rules | https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-rule-groups.html
  - AWS Route 53: DNS Firewall VPC configuration (fail-open) | https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resolver-dns-firewall-vpc-configuration.html
  - AWS Route 53: цены | https://aws.amazon.com/route53/pricing/
  - AWS Route 53: DNS Firewall metrics in CloudWatch | https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/monitoring-resolver-dns-firewall-with-cloudwatch.html
---

## Что это и зачем

Серверы API ходят в интернет к Stripe, Twilio, Bunny, R2, Sentry, к пушам Apple и Google и к реестрам адвокатов. Сейчас им можно ходить куда угодно. Если в какую-то библиотеку попадёт вредный код, он сможет отправить данные на чужой адрес. DNS Firewall (служба AWS) пропускает только адреса из нашего списка.

Сначала фильтр работает в режиме «только журнал» (ALERT): ничего не блокирует, а записывает чужие адреса. Через две недели по журналу решаем, включать ли блокировку (BLOCK). Если сама служба сломается, запросы пройдут: приложение из-за фильтра не упадёт.

## Что понадобится

- Один раз: применённый `infra/bootstrap` (он даёт роли применения облака права на DNS Firewall). Это шаг 4.5 инструкции «Защита от ботов и копия фото: какие ключи вставить».

## Шаги

1. Ничего вставлять не нужно: фильтр включён в коде (`dns_firewall_enabled = true`, режим `ALERT`, файл `infra/envs/prod/growth.auto.tfvars.json`).
2. После шага с `infra/bootstrap`: «Масштаб» → «Применить изменения из кода» → в плане только новые ресурсы `module.stack.module.dns_firewall` → код 2FA. Пока прав нет, план сам откладывает фильтр и пишет «ждёт прав bootstrap».
3. Состояние: «Запуск» → «Фильтр исходящих адресов серверов (DNS Firewall)»: режим и сколько чужих адресов было за 2 недели (с примерами).
4. Через 2 недели пришлите список чужих адресов Claude: нужные добавим в список.
5. Блокировка: «Масштаб» → «Фильтр исходящих адресов: блокировать чужие (BLOCK)» → «Вкл» → код 2FA. Не включайте, пока не решено, как работают превью ссылок: их адреса дают сами люди.

## Как проверить

- «Запуск» → строка фильтра зелёная: «Работает, режим ALERT».
- **AWS Console → VPC → DNS Firewall → Rule groups**: есть группа `lawbid-prod-egress` с двумя правилами, она привязана к VPC прода.
- Приложение и сайт работают как раньше: вход, сообщения, оплата, фото и видео.
- Откат: «Масштаб» → «Фильтр исходящих адресов» → «Выкл» → код 2FA.

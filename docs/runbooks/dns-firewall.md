# DNS Firewall: исходящие адреса серверов API (S10)

owner: владелец (terraform apply)

Код: `infra/modules/dns-firewall`, переключатели в `infra/envs/prod/variables.tf`
(`dns_firewall_enabled`, `dns_firewall_mode`, `dns_firewall_extra_domains`).
Источник: SECOND_PASS_2026-11-26, строка S10; ASVS 5.0 V13.2.4/V13.2.5; AWS Well-Architected SEC05-BP02.

## Что это

Route 53 Resolver DNS Firewall (служба AWS) проверяет каждое имя, которое серверы API и воркера
спрашивают у DNS внутри нашей VPC. Есть два правила:

1. Имена из списка (AWS, наши домены, Stripe, Twilio, Persona, Cloudflare/R2, Bunny, Google/Apple
   для входа и пушей, Microsoft, Sentry, PagerDuty, Slack, HIBP, реестры адвокатов всех штатов) пропускаются.
2. Все остальные имена: в режиме `ALERT` ответ обычный, а имя пишется в журнал;
   в режиме `BLOCK` сервер получает пустой ответ (NODATA) и соединиться не может.

Если сама служба DNS Firewall не отвечает, запросы проходят (fail-open): приложение не падает из-за фильтра.
Журнал запросов идёт в CloudWatch Logs, группа `/aws/route53resolver/lawbid-prod`, хранится 30 дней.

## Что может сломаться и от чего зависит

- В режиме `ALERT` ничего не ломается: это только журнал.
- В режиме `BLOCK` перестанут работать вызовы на адрес не из списка. Сейчас так работают
  **превью ссылок** (адрес даёт человек). Поэтому перед `BLOCK` нужно решение: превью делать
  через отдельный путь или оставить `ALERT`. Без такого решения `BLOCK` не включать.
- Новый внешний сервис в коде = новая строка в списке (`base_domains` в модуле) или в `dns_firewall_extra_domains`.

## Цена

$0,60 за миллион DNS-запросов, $0,0005 за адрес в списке в месяц (около 240 адресов = $0,12),
журнал запросов бесплатный, запись в CloudWatch Logs $0,50 за ГБ. Оценка: $1–15 в месяц
(строка `aws.dns_firewall` в реестре расходов, проверено 26.11 на aws.amazon.com/route53/pricing).

## Шаги владельца

1. В файле `infra/envs/prod/terraform.tfvars` на своём Mac добавить строку `dns_firewall_enabled = true`.
2. В папке `infra/envs/prod` выполнить `terraform plan`: должны появиться только ресурсы
   `module.stack.module.dns_firewall` (около 9 штук: 2 списка, группа, 2 правила, привязка к VPC, настройка fail-open, журнал), ничего не удаляется.
3. Выполнить `terraform apply`.
4. Через 2 недели открыть CloudWatch Logs Insights по группе `/aws/route53resolver/lawbid-prod` с запросом
   `fields query_name | filter firewall_rule_action = "ALERT" | stats count() by query_name | sort count() desc`
   и прислать Claude список имён. Нужные добавим в список, после этого решение про `BLOCK`.

## Как проверить

- AWS Console → VPC → DNS Firewall → Rule groups: есть `lawbid-prod-egress` с двумя правилами, привязан к VPC `lawbid-prod`.
- CloudWatch Logs → `/aws/route53resolver/lawbid-prod`: через несколько минут после apply появляются записи.
- Приложение и сайт работают как раньше (вход, сообщения, оплата, загрузка фото и видео).

## Откат

`dns_firewall_enabled = false` и `terraform apply`: всё созданное удаляется, DNS работает как раньше.


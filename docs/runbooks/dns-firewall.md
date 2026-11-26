# DNS Firewall: исходящие адреса серверов API (S10)

owner: владелец (один раз infra/bootstrap, дальше кнопки в админке)

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

Owner 26.11 «включить»: on in code (`infra/envs/prod/growth.auto.tfvars.json`: `dns_firewall_enabled = true`,
`dns_firewall_mode = "ALERT"`), switched from the admin like every other Terraform row
(rows `aws.dns_firewall` and `aws.dns_firewall_block` on «Масштаб» / «Расходы»).

1. Once: `terraform apply` in `infra/bootstrap` (gives the `infra-apply` role `route53resolver:*Firewall*`,
   `*ResolverQueryLogConfig*`, tags and `iam:SimulatePrincipalPolicy`). Until then
   `scripts/infra/rights-gate.mjs` plans every admin apply with `-var=dns_firewall_enabled=false`
   (the run summary says «Waits for the bootstrap rights»), so no apply fails with AccessDenied.
2. «Масштаб» → «Применить изменения из кода» → 2FA (or any next infra request): the plan adds only
   `module.stack.module.dns_firewall` (2 lists, group, 2 rules, VPC link, fail-open, query log, metric filter).
3. Status: admin «Запуск» → «Фильтр исходящих адресов серверов (DNS Firewall)»: mode (last done request of
   `aws.dns_firewall_block`), running (`AWS/Route53Resolver` `FirewallRuleGroupQueryVolume` exists) and the unknown
   domains of the last 2 weeks (one metric per domain, `LawBid/DnsFirewall` `UnknownDomainQueries`, dimension
   `Domain`, from the metric filter on the query log; read with `cloudwatch:ListMetrics`).
4. After 2 weeks: send the list to Claude; needed names go to `base_domains` / `dns_firewall_extra_domains`.
   BLOCK = row «Фильтр исходящих адресов: блокировать чужие (BLOCK)» → Вкл → 2FA.

## Как проверить

- Admin «Запуск»: the filter row is green «Работает, режим ALERT».
- AWS Console → VPC → DNS Firewall → Rule groups: `lawbid-prod-egress` with two rules, linked to VPC `lawbid-prod`.
- CloudWatch Logs → `/aws/route53resolver/lawbid-prod`: records a few minutes after the apply.
- The app and the site work as before (sign-in, messages, payments, photo and video uploads).

## Откат

«Масштаб» → «Фильтр исходящих адресов» → «Выкл» → 2FA: everything it created is removed, DNS works as before.

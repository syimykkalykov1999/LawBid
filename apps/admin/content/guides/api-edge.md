---
id: api-edge
title: Край сети для API приложения (CloudFront, HTTP/3)
category: system
cost: Запросы и трафик CloudFront (гигабайт дешевле, чем выход через балансировщик и NAT); вторая копия правил WAF - $5 в месяц + $1 за правило + $0.60 за миллион запросов; метрики края около $2.40 в месяц. Цены AWS на 25.11.2026
time: 3 шага в разные дни, каждый 15-30 минут (оценка)
verified: 2026-11-25
sources:
  - Отчёт: docs/dev/STAGE2_ARCH_PERF_2026-11-25.md, пункт G1 | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/dev/STAGE2_ARCH_PERF_2026-11-25.md
  - Meta: как Facebook перевёл приложения на QUIC (21.10.2020) | https://engineering.fb.com/2020/10/21/networking-traffic/how-facebook-is-bringing-quic-to-billions/
  - Amazon CloudFront: готовые политики кэша | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html
  - Amazon CloudFront: готовые политики запросов к источнику | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-origin-request-policies.html
  - AWS: закрыть балансировщик для всех, кроме CloudFront | https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/restrict-access-to-load-balancer.html
---

## Что это и зачем

Сейчас телефоны ходят к серверу напрямую в один дата-центр в Вирджинии, по старому TCP. Meta и Uber пускают запросы приложений через край сети по QUIC (HTTP/3): соединение открывается быстрее, а на плохой мобильной сети меньше подвисаний. Приложение уже умеет HTTP/3, ему не хватало адреса, который его предлагает.

В коде готова раздача CloudFront для `api.<домен>`:
- HTTP/3 и WebSocket (чаты и звонки работают как раньше);
- ничего не кэшируется: ответ одного человека никогда не попадёт другому;
- те же правила WAF, что и на балансировщике, но на краю, где виден настоящий адрес человека.

Всё выключено, пока вы не включите. Порядок важен: **включить, перевести DNS, закрыть обход**. Каждый шаг отдельным apply.

## Шаги

1. **Staging, шаг 1.** В `terraform.tfvars` staging: `api_edge_enabled = true`. `terraform plan`: новые `module.stack.module.api_edge[0]...` (раздача, 2 тревоги, метрики), `random_password.api_edge_origin`, вторая копия WAF `...-api-edge-waf`, в WAF балансировщика новое правило `edge-verified`. Удалений быть не должно. Apply. В выводе `terraform output` смотрите `stack.api_edge_domain` (вида `d123.cloudfront.net`).
2. **Staging, шаг 2 (DNS).** В Cloudflare (или где живёт DNS) запись `api` staging: CNAME на `d123.cloudfront.net`, **DNS only** (серое облако, иначе Cloudflare встанет перед CloudFront). TTL 60-300. С Route 53 вместо этого `api_edge_dns = true` и apply.
3. **Staging, шаг 3 (закрыть обход).** Через 10 минут после DNS: `api_edge_origin_lock = true`, apply. Теперь балансировщик отвечает 403 всем запросам к API мимо края, а сервер берёт адрес человека из двух прокси (CloudFront + балансировщик).
4. Проверить staging (раздел ниже), сутки посмотреть тревоги.
5. **Прод.** Те же три шага в `infra/envs/prod`, шаг 1 и шаг 3 в тихое время. Перед шагом 3 убедитесь, что `web_api_proxy` выключен: Terraform сам откажет, если нет.

## Как проверить

- После шага 2: `curl -sI https://api.lawbid.dev/health` показывает `via: ... CloudFront` и `alt-svc: h3=":443"`.
- Приложение на телефоне: вход, лента, чат, отправка фото, звонок.
- После шага 3: прямой запрос к адресу балансировщика с заголовком `Host: api.lawbid.dev` получает 403.
- В админке «Здоровье системы» зелёное. Тревоги `lawbid-prod-api-edge-5xx-rate` и `lawbid-prod-api-edge-origin-latency` в состоянии OK.

## Частые ошибки

- Шаг 3 раньше DNS: все телефоны получат 403. Откат: `api_edge_origin_lock = false`, apply.
- Оранжевое облако Cloudflare на записи `api`: два края подряд. Нужно серое (DNS only).
- Откат целиком, строго в этом порядке: `api_edge_origin_lock = false` и apply, потом DNS `api` обратно на адрес балансировщика, через 10 минут `api_edge_enabled = false` и apply.

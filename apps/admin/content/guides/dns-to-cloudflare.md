---
id: dns-to-cloudflare
title: Домен под управлением Cloudflare (смена серверов имён)
category: launch
cost: Бесплатно (тариф Free). Сам домен остаётся у регистратора (у нас Namecheap).
time: 15 минут работы, затем ожидание до 24 часов
launch: dns
verified: 2026-10-25
sources:
  - Cloudflare: Full setup (change nameservers) | https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
  - Cloudflare: DNSSEC before changing nameservers | https://developers.cloudflare.com/dns/dnssec/
  - Namecheap: How to change nameservers | https://www.namecheap.com/support/knowledgebase/article.aspx/9607/2210/how-can-i-set-up-dns-records-for-my-domain/
---

## Что это и зачем

Сейчас DNS (адресная книга домена) ведёт регистратор. Для фото через R2 нужно, чтобы её вёл Cloudflare. Сайт, приложение и почта при этом не должны прерываться, если записи перенесены точно. Полный список записей и откат: `docs/runbooks/DNS_TO_CLOUDFLARE.md`.

## Что понадобится

- Аккаунт Cloudflare (см. инструкцию «Cloudflare: аккаунт и защита входа»).
- Вход в кабинет регистратора домена (у нас Namecheap).
- Список записей из `docs/runbooks/DNS_TO_CLOUDFLARE.md` для сверки.

## Шаги

1. Откройте [dash.cloudflare.com](https://dash.cloudflare.com) → **Domains**.
2. Нажмите **Onboard a domain**, впишите `lawbid.dev`, способ добавления записей: быстрый поиск (**quick scan**). Нажмите **Continue**.
3. Выберите тариф **Free**.
4. Откройте **DNS Records** и сверьте со списком в runbook: должны быть сайт (`@`, `www`), `api`, `admin`, записи сертификатов, почтовые (DKIM, `_amazonses`, `_dmarc`). Если чего-то нет, добавьте вручную по кнопке **Add record**.
5. У КАЖДОЙ записи облачко должно быть серым (**DNS only**). Оранжевое (**Proxied**) не включайте: сайт и API так сломаются.
6. Не удаляйте ничего, что есть у регистратора и чего нет в Cloudflare: почта перестанет доходить. Лишнее перенесите.
7. Откройте **Overview** домена и скопируйте два **nameserver** вида `xxx.ns.cloudflare.com`.
8. Если у регистратора включён **DNSSEC**, сначала отключите его (иначе домен перестанет открываться). Если не уверены, не меняйте серверы имён, а спросите.
9. Namecheap: [namecheap.com](https://www.namecheap.com) → **Account** → **Domain List** → **Manage** у домена. На вкладке **Domain** в списке **Nameservers** выберите **Custom DNS**, впишите два адреса из Cloudflare и нажмите галочку для сохранения.
10. Другой регистратор: найдите в настройках домена пункт Nameservers / DNS servers и сделайте то же самое.
11. Вернитесь в Cloudflare и нажмите **Check nameservers**. Ожидание: обычно минуты-часы, максимум 24 часа.
12. Статус домена на странице **Domains** должен стать **Active**, придёт письмо от Cloudflare.

## Куда вставить в нашей админке

Ничего вставлять не нужно: страница «Запуск» сама читает серверы имён домена. После перехода сообщите разработчику, чтобы он проверил сайт, API, админку и почту, и перешёл к R2 (см. инструкцию «Cloudflare: фото и медиа (R2)»).

## Как проверить

- «Запуск» → «Домен работает через Cloudflare (DNS)» станет зелёной (серверы имён оканчиваются на `.ns.cloudflare.com`). Нажмите «Проверить заново» (данные обновляются раз в 5 минут).
- В терминале: `dig ns lawbid.dev @1.1.1.1` показывает адреса Cloudflare.
- Сайт, `api.lawbid.dev`, `admin.lawbid.dev` открываются, тестовое письмо доходит.

## Частые ошибки

- Включили оранжевое облачко: сайт или API перестают открываться. Верните серое.
- Не перенесли почтовые записи: письма не доходят. Сравните со списком записей в runbook.
- Не отключили DNSSEC: у части пользователей домен не открывается.
- Откат: у регистратора верните стандартные серверы имён (Namecheap: **Namecheap BasicDNS**). Старые записи у регистратора не удаляются.

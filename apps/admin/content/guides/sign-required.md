---
id: sign-required
title: Включить обязательную подпись образов (SIGN_REQUIRED)
category: security
cost: Бесплатно
time: 5 минут (после первой успешной выкладки)
launch: sign_required
verified: 2026-10-25
sources:
  - Репозиторий: docs/runbooks/DEPLOY_SAFETY.md | https://github.com/syimykkalykov1999/LawBid/blob/main/docs/runbooks/DEPLOY_SAFETY.md
  - GitHub: Store information in variables | https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables
  - Sigstore: Cosign signing overview | https://docs.sigstore.dev/cosign/signing/overview/
---

## Что это и зачем

При каждой выкладке наша сборка подписывает образы программ (cosign) и прикладывает список состава (SBOM). Перед боевой выкладкой подпись проверяется. Пока параметр `SIGN_REQUIRED` не задан, проблема с подписью даёт только жёлтое предупреждение, и неподписанный образ всё равно выкатится. Со значением `true` неподписанный образ на прод не попадёт.

## Что понадобится

- Хотя бы одна успешная боевая выкладка, в логе которой есть строка `signature OK` (см. инструкцию «Выкатить последнюю версию (main) на боевой сервер»).
- Владелец или админ репозитория на GitHub.

## Шаги

1. Откройте репозиторий на GitHub → вкладка **Actions**, последний запуск **Deploy**.
2. Откройте job **Deploy production** и найдите шаг **Verify the image signatures** со строками `signature OK: lawbid-api@...` и `signature OK: lawbid-admin@...`. Если там предупреждение или ошибка, не включайте параметр и напишите Claude.
3. Откройте репозиторий → **Settings**.
4. Слева в **Security** выберите **Secrets and variables** → **Actions**.
5. Перейдите на вкладку **Variables** (не Secrets!) и нажмите **New repository variable**.
6. В поле **Name** впишите `SIGN_REQUIRED`, в поле **Value** впишите `true`. Нажмите **Add variable**.
7. Запустите **Deploy** ещё раз (инструкция «Выкатить последнюю версию (main) на боевой сервер») и убедитесь, что шаги подписи прошли без предупреждений.
8. Откройте **Система → Запуск** и поставьте галочку **Сделано** у строки «SIGN_REQUIRED (обязательная подпись запросов)». Её нельзя определить автоматически.

## Куда вставить в нашей админке

Ничего вставлять не нужно, только галочка **Сделано** на странице **Система → Запуск**.

## Как проверить

В **Settings → Secrets and variables → Actions → Variables** есть `SIGN_REQUIRED` со значением `true`, а следующая выкладка прошла зелёной. Строка «SIGN_REQUIRED (обязательная подпись запросов)» на «Запуске» станет зелёной после вашей галочки.

## Частые ошибки

- Включили до первой успешной проверки: выкладки начнут падать. Верните значение или удалите переменную.
- Создали секрет вместо переменной: workflow читает именно `vars.SIGN_REQUIRED`.
- Откат (**Rollback production**) на старые образы подпись не проверяет, это нормально.
- (не удалось проверить: подсказка на «Запуске» говорит «в сборке приложения», но в коде `SIGN_REQUIRED` найден только в deploy.yml и относится к подписи образов, а не к подписи запросов мобильного приложения.)

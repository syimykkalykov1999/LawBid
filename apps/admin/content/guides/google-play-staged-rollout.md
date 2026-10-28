---
id: google-play-staged-rollout
title: Постепенный выпуск в Google Play (staged rollout)
category: launch
cost: бесплатно
time: 5 минут на запуск; процент вы повышаете сами
runbook: mobile-staged-rollout.md
verified: 2026-10-25
sources:
  - Google: Release app updates with staged roll-outs | https://support.google.com/googleplay/android-developer/answer/6346149
  - Google: Halting a fully rolled-out release | https://support.google.com/googleplay/android-developer/answer/16285429
---

## Что это и зачем

Новая версия приходит не всем, а только части людей (например, 5%). Если вылезла ошибка, вы останавливаете выпуск, и остальные её не получают. Процент сам не растёт: повышаете вручную.

## Что понадобится

- Сборка `.aab` загружена и проверена в Internal testing (см. инструкцию «Подпись приложения в Google Play (Play App Signing)»).
- Анкеты Play Console заполнены: **Data safety**, рейтинг, **Target audience** (см. инструкцию «Анкета Data safety в Google Play»).

## Шаги

1. Откройте [play.google.com/console](https://play.google.com/console) → LawBid → **Test and release** → **Production**.
2. Нажмите **Create new release**.
3. Загрузите `.aab` (или выберите уже загруженную сборку из библиотеки) и впишите описание версии в **Release notes**.
4. Нажмите **Next**. На экране проверки в блоке **Staged rollout** впишите процент. Для первого выпуска возьмите 5-10%, для обычных обновлений 10-20%.
5. В **Country availability** оставьте только США (**Select specific countries/regions**).
6. Нажмите **Start rollout to production**. Первая проверка Google может занять несколько дней.
7. Через день-два посмотрите вылеты в админке («Вылеты») и в Sentry. Если всё спокойно, откройте **Production** → вкладка **Releases** → **Manage rollout** → **Update rollout**, впишите больший процент (25, 50, 100) и нажмите **Confirm update**.
8. Если появилась ошибка: **Manage rollout** → **Halt rollout**. Новые люди перестанут получать эту версию. Те, кто уже получил, остаются на ней.
9. Исправьте ошибку, выпустите новую сборку с большим номером сборки. Нашей системой номер ставится автоматически.
10. Чтобы возобновить остановленный выпуск: **Manage rollout** → **Resume rollout**, задайте процент и **Confirm update**.

## Куда вставить в нашей админке

Ничего вставлять не нужно. Сводка порядка выпуска в `docs/runbooks/STORE_RELEASE.md`.

## Как проверить

На вкладке **Releases** виден статус «Rolling out» и текущий процент. Когда процент достиг 100%, выпуск считается завершённым (отдельной кнопки завершения нет).

## Частые ошибки

- Ждать, что процент поднимется сам: нет, повышайте вручную.
- Остановили выпуск и думаете, что вернули старую версию тем, кто обновился. Не вернули: нужна новая сборка с исправлением.
- Для обычных пользователей обновление приходит не мгновенно: Google раздаёт его в течение дней, это нормально.
- Остановка уже полностью выпущенной версии (100%) работает по той же кнопке **Manage rollout** → **Halt rollout**; предыдущая версия тогда становится доступна новым пользователям (описано в справке Google).

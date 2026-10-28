---
id: apple-phased-release
title: Постепенный выпуск в App Store (за 7 дней)
category: launch
cost: бесплатно
time: 2 минуты на включение, сам выпуск идёт 7 дней
runbook: mobile-staged-rollout.md
verified: 2026-10-25
sources:
  - Apple: Release a version update in phases | https://developer.apple.com/help/app-store-connect/update-your-app/release-a-version-update-in-phases/
  - Apple: Submit an app | https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/
---

## Что это и зачем

Обновление приходит не ко всем сразу, а понемногу за 7 дней. Если в новой версии ошибка, её увидит малая часть людей, и выпуск можно остановить. Рекомендуем включать для каждого обновления.

## Что понадобится

- Запись приложения в App Store Connect (см. инструкцию «Запись приложения LawBid в App Store Connect»).
- Роль Account Holder, Admin или App Manager.

## Шаги

1. Откройте [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **Apps** → LawBid.
2. В боковом меню нажмите на версию, которую отправляете.
3. Справа прокрутите вниз до блока **Phased Release for Automatic Updates**.
4. Выберите **Release update over 7-day period using phased release**.
5. Нажмите **Save** и отправьте версию на проверку как обычно.
6. После одобрения статус станет **Ready for Distribution**, рядом будет пометка про постепенный выпуск. Доли пользователей по дням: 1%, 2%, 5%, 10%, 20%, 50%, 100%.
7. Чтобы остановить, откройте версию, в блоке **Phased Release for Automatic Updates** выберите **Pause Phased Release** → **Save**. Всего можно держать паузу 30 дней, пауз может быть сколько угодно.
8. Чтобы продолжить, в том же блоке выберите **Use Phased Release** → **Save**.
9. Чтобы отдать обновление всем сразу, нажмите вверху справа **Release to All Users**.

## Куда вставить в нашей админке

Ничего вставлять не нужно.

## Как проверить

На странице версии рядом со статусом **Ready for Distribution** видна пометка о постепенном выпуске. Когда выпуск дойдёт до 100%, пользователи с ролью Admin или App Manager получат уведомление.

## Частые ошибки

- Думать, что выпуск закрывает скачивание. Любой человек может обновиться вручную в любой день, ограничение касается только автообновлений.
- Включать слишком поздно: настройка доступна, пока версия не вышла (статусы **Prepare for Submission**, **Waiting for Review**, **In Review**, **Pending Developer Release** и похожие). Включайте до отправки.
- Снять приложение с продажи во время выпуска: постепенный выпуск этой версии пропадает навсегда, после возврата приложение доступно всем сразу.
- Ждать, что пауза вернёт старую версию тем, кто уже обновился. Она не вернёт, нужна новая версия.

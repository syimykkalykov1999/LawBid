---
id: firebase-app-check
title: Firebase App Check - защита от ботов
category: system
cost: Бесплатно в рамках нашего объёма (у Firebase есть квоты на выдачу токенов)
time: 40 минут на регистрацию, потом неделя наблюдения
launch: app_check
verified: 2026-10-25
sources:
  - Firebase - обзор App Check | https://firebase.google.com/docs/app-check
  - Firebase - App Attest на iOS | https://firebase.google.com/docs/app-check/ios/app-attest-provider
  - Firebase - Play Integrity на Android | https://firebase.google.com/docs/app-check/android/play-integrity-provider
  - Firebase - включение Enforce | https://firebase.google.com/docs/app-check/enable-enforcement
---

## Что это и зачем

App Check доказывает серверу, что запрос пришёл из настоящего нашего приложения, а не из скрипта. Это главная защита от накрутки SMS: боты просят коды, а платим мы. Технические детали - `docs/runbooks/APP_CHECK.md`.

## Что понадобится

- Проект Firebase, в котором уже заполнены ключи FCM в нашей админке (ключи и сервисы, Firebase Cloud Messaging).
- Права Owner в проекте Firebase и в Google Play Console.
- Отпечаток SHA-256 подписи Android-приложения (его даёт разработчик или Play Console).

## Шаги

1. Откройте [console.firebase.google.com](https://console.firebase.google.com/) и ваш проект.
2. Слева выберите **Security** → **App Check**.
3. Вкладка **Apps**. Для iPhone: найдите iOS-приложение, нажмите регистрацию и выберите провайдера **App Attest**. Запасной провайдер для старых iOS (до 14) - **DeviceCheck**, его включает код приложения. Можно задать время жизни токена (TTL), по умолчанию 1 час.
4. Для Android: сначала в [Google Play Console](https://play.google.com/console/developers/) откройте приложение → **Release** → **App integrity**. В блоке **Play Integrity API** нажмите **Link Cloud project** и выберите ваш проект Firebase (нужна роль Owner).
5. Затем в Firebase на вкладке **Apps** зарегистрируйте Android-приложение с провайдером **Play Integrity**. Укажите **SHA-256 fingerprint** подписи.
6. Для веба зарегистрируйте сайт с провайдером **reCAPTCHA Enterprise** (нужен ключ сайта reCAPTCHA Enterprise).
7. Зарегистрируйте все приложения проекта: после включения принуждения незарегистрированные блокируются.
8. Приложение должно отправлять токен в заголовке `X-Firebase-AppCheck`. Это уже сделано в нашем коде, нужен свежий выпуск приложения.

## Куда вставить в нашей админке

**Система** → **Настройки** → параметр `security.app_check.mode`:

1. Сначала `monitor`: сервер только записывает результат, никого не блокирует.
2. Через неделю, когда почти все запросы с токеном, переключите на `enforce`.
3. Откат: верните `monitor`, перевыпуск приложения не нужен.

Включать кнопку **Enforce** в Firebase Console не нужно: принуждение делает наш сервер сам. В списке продуктов Firebase для Enforce нет Cloud Messaging, зато есть Authentication, Firestore, Storage и др.

## Как проверить

1. В **Система** → **Запуск** пункт «App Check (защита от ботов в приложении)»: жёлтый при `monitor`, зелёный при `enforce`, красный при выключенном режиме.
2. Перед `enforce` разработчик смотрит журнал: доля `missing` должна упасть почти до нуля.
3. В Firebase во вкладке **App Check** видны метрики запросов с токеном.

## Частые ошибки

- Много `invalid` в журнале: не тот проект Firebase в ключах FCM или приложение зарегистрировано неверно.
- На iOS: у App Attest в файле entitlements должна быть среда `production`, песочница не принимается.
- Android без SHA-256 в регистрации или без связи с Play Console: токен не выдаётся.
- Переключили на `enforce` слишком рано: старые версии приложения не смогут просить код входа. Выжидайте неделю.
- После включения Enforce в Firebase изменение действует до 15 минут.
- (не удалось проверить: как именно в Console называется ключ reCAPTCHA Enterprise для веба в 2026 году - в документации это отдельный раздел reCAPTCHA Enterprise)

---
id: google-play-app-signing
title: Подпись приложения в Google Play (Play App Signing)
category: launch
cost: бесплатно
time: 1-2 часа
verified: 2026-10-25
sources:
  - Google: Use Play App Signing | https://support.google.com/googleplay/android-developer/answer/9842756
  - Android Developers: Sign your app | https://developer.android.com/studio/publish/app-signing
---

## Что это и зачем

У приложения два ключа. **Upload key** лежит у вас: им вы подписываете файл перед загрузкой. **App signing key** хранит Google: им подписывается то, что скачивают люди. Если вы потеряете upload key, Google его сбросит. Если бы ключ был только ваш и пропал, обновить приложение стало бы нельзя.

## Что понадобится

- Приложение создано в Play Console (см. инструкцию «Аккаунт Google Play Console для компании»).
- Mac с настроенным Flutter. Команды сборки в `docs/runbooks/STORE_RELEASE.md`, раздел 2.
- Менеджер паролей для хранения ключа.

## Шаги

1. Создайте upload key один раз на вашем Mac, командой из раздела 2.1 файла `docs/runbooks/STORE_RELEASE.md` (`keytool -genkey ...`). Имя файла `lawbid-upload.jks`, алиас `upload`.
2. Сохраните файл `.jks` и оба пароля в менеджер паролей и ещё в одно место. Потеря не катастрофа (Google сбросит ключ), но это дни ожидания.
3. Создайте `apps/mobile/android/key.properties` по образцу из runbook. Файл не попадает в git.
4. Соберите файл `.aab` командой из раздела 2.2 runbook. Готовый файл: `build/app/outputs/bundle/prodRelease/app-prod-release.aab`.
5. Откройте [play.google.com/console](https://play.google.com/console) → LawBid → **Test and release** → **Testing** → **Internal testing** → **Create new release**.
6. Если спросит про подпись, выберите вариант, где Google создаёт ключ (**Use Google-generated key**). Загрузите `.aab` в поле **App bundles**. При первой загрузке Google сам включает Play App Signing.
7. Нажмите **Save**, потом **Next**, и **Start rollout to Internal testing**.
8. Посмотреть отпечатки ключей можно в разделе подписи приложения. В новом интерфейсе путь такой: **Protected with Play** → **Play Store distribution** → **Go to Play app signing**. В старом интерфейсе: **Test and release** → **App integrity** → **App signing** (не удалось проверить: какое из названий сейчас у вас в консоли).
9. Если вы потеряли upload key: создайте новый, выгрузите сертификат командой `keytool -export -rfc`, затем в консоли **Protected with Play** → **Play Store protection** → **Manage Play app signing** → **Request upload key reset**. Укажите причину, загрузите файл PEM и нажмите **Request**.

## Куда вставить в нашей админке

Ничего вставлять не нужно. Для автоматической сборки в GitHub положите ключ в секреты `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (см. runbook, раздел 2.1). Значения в репозиторий не вставляйте.

## Как проверить

- Сборка загрузилась без красных ошибок, версия показана в **Internal testing**.
- Приложение устанавливается по ссылке для тестеров на ваш Android-телефон.
- Если вход по Google или Firebase просит отпечаток SHA-1/SHA-256, берите его из раздела подписи приложения в Play Console, а не из локального файла.

## Частые ошибки

- Сборка без ключа: наш скрипт сразу падает с ошибкой, а не делает отладочную подпись. Это правильно, найдите `key.properties`.
- Загрузили `.apk` вместо `.aab`: Google Play принимает только `.aab`.
- Положили `.jks` или пароли в git. Если случилось, сбросьте ключ через Request upload key reset.
- Сменили ключ подписи после выпуска: это можно только до публикации на open testing или production.

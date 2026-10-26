---
id: google-play-data-safety
title: Анкета Data safety в Google Play
category: stores
cost: бесплатно
time: 30-60 минут; проверка Google до 7 дней
verified: 2026-10-25
sources:
  - Google: Provide information for Google Play's Data safety section | https://support.google.com/googleplay/android-developer/answer/10787469
  - Google: Understand account deletion requirements | https://support.google.com/googleplay/android-developer/answer/13327111
---

## Что это и зачем

Анкета Data safety рассказывает людям на странице приложения, какие данные мы собираем. Без неё (и без ссылки на политику конфиденциальности) приложение не пройдёт проверку. Ответы должны совпадать с реальностью и с App Privacy в App Store.

## Что понадобится

- Ссылка на политику конфиденциальности: `https://lawbid.dev/privacy`.
- Ссылка для удаления аккаунта: `https://lawbid.dev/delete-account`. Она должна работать без входа в приложение и называть приложение так, как оно называется в Google Play.
- Готовые ответы в `docs/store/RELEASE_CHECKLIST.md`, раздел 5.

## Шаги

1. Откройте [play.google.com/console](https://play.google.com/console) → LawBid → **Policy and programs** → **App content**.
2. В блоке **Data safety** нажмите **Start**. Прочитайте **Overview** и нажмите **Next**.
3. В **Data collection and security** на вопрос, собирает ли приложение данные, выберите **Yes**.
4. На вопрос «шифруются ли данные при передаче» выберите **Yes** (весь трафик идёт по HTTPS).
5. На вопрос про удаление данных выберите **Yes**, мы даём способ запросить удаление.
6. Нажмите **Next**. В **Data types** отметьте: Personal info (имя, email, телефон, User IDs, прочее: номер лицензии и фото документа), Financial info (Purchase history), Messages (Other in-app messages), Photos and videos, Audio, Files and docs, App activity, Contacts, Device or other IDs.
7. Нажмите **Next**. В **Data usage and handling** нажмите **Start** возле каждого типа. Для всех: **Collected**, цели **App functionality** и **Account management**. Для Device or other IDs добавьте **Fraud prevention, security**. Обязательные: имя, email, телефон, User IDs, документы, Device IDs. Остальные необязательные.
8. На вопрос, передаём ли данные третьим лицам, отвечайте **No**: Stripe, AWS, Twilio, Firebase и другие работают как наши подрядчики.
9. Просмотрите **Store listing preview**, нажмите **Submit**.
10. В том же разделе **App content** вставьте ссылку на политику в блок **Privacy policy**. В вопросах про удаление аккаунта впишите ссылку `https://lawbid.dev/delete-account`.
11. Остальные формы в **App content**: **Target audience and content** (18+), **Ads** (нет), **Content rating** (категория «социальные и коммуникации»), см. `RELEASE_CHECKLIST` разделы 6-7.

## Куда вставить в нашей админке

Ничего вставлять не нужно. Если политика конфиденциальности меняется, правьте её в админке «Юридические документы» и обновите анкету.

## Как проверить

- В **App content** у блока **Data safety** стоит зелёная отметка, в **Policy status** нет предупреждений.
- На странице приложения в Google Play виден раздел «Data safety».

## Частые ошибки

- Забыли про Contacts: мы храним хэши номеров, но это тоже сбор данных.
- Ответили «данные не собираются», потому что «у нас всё безопасно». Нужно отвечать про сбор, а не про защиту.
- Ссылка на удаление аккаунта ведёт на страницу, где сначала надо скачать приложение. Нужна страница, работающая в браузере.
- Изменили приложение (добавили аналитику), а анкету не обновили: приложение могут снять.
- Описание путей в интерфейсе Google иногда меняется (не удалось проверить: сейчас блок называется **Policy and programs** → **App content**; справка называет только **App content**).

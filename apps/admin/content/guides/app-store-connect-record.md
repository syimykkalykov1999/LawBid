---
id: app-store-connect-record
title: Запись приложения LawBid в App Store Connect
category: launch
cost: бесплатно (нужен активный аккаунт за $99 в год)
time: 1-2 часа на заполнение; срок проверки Apple (не удалось проверить: Apple точный срок не называет, обычно 1-3 дня)
verified: 2026-10-25
sources:
  - Apple: Add a new app | https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/
  - Apple: Set an app age rating | https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/
  - Apple: App privacy | https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy/
  - Apple: TestFlight overview | https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/
  - Apple: Submit an app | https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/
---

## Что это и зачем

Запись приложения (app record) в App Store Connect нужна, чтобы загружать сборки, раздавать их тестерам через TestFlight и отправлять на проверку Apple. Порядок сборки на Mac смотрите в `docs/runbooks/STORE_RELEASE.md`, готовые ответы на анкеты в `docs/store/RELEASE_CHECKLIST.md`.

## Что понадобится

- Активный аккаунт организации (см. инструкцию «Аккаунт Apple Developer для компании»).
- Account Holder должен принять последнее соглашение в разделе **Business**, иначе приложение не добавить.
- Идентификатор приложения (bundle ID): `com.lawbid.lawbid`.
- Скриншоты iPhone 6.9" (3-10 штук) и тексты из `store/listing-en.md`.
- Два демо-кода (клиент и адвокат) для проверяющих Apple, их выдаёт админка.

## Шаги

1. Откройте [appstoreconnect.apple.com](https://appstoreconnect.apple.com) и нажмите **Apps**.
2. Нажмите **+** в левом верхнем углу → **New App**.
3. В окне **New App** отметьте платформу **iOS**.
4. В поле **Name** впишите `LawBid`. В поле **Primary Language** выберите `English (U.S.)`.
5. В поле **Bundle ID** выберите `com.lawbid.lawbid`. Если его нет в списке, сначала создайте его на [developer.apple.com/account](https://developer.apple.com/account) в разделе **Identifiers** с возможностями Push Notifications и Associated Domains.
6. В поле **SKU** впишите `lawbid` (внутреннее имя, пользователи его не видят).
7. В **User Access** выберите **Full Access** и нажмите **Create**. Приложение появится со статусом **Prepare for Submission**.
8. Откройте приложение → **App Information** (боковое меню, раздел **General**). Под **Age Ratings** нажмите **Set Up Age Ratings** и ответьте по `RELEASE_CHECKLIST` (раздел 6). Для чата и пользовательского контента отвечайте **Yes**. В **Age Categories and Override** оставьте **Not Applicable**. Наши условия требуют 18+, поэтому там, где можно, выберите 18+.
9. Откройте **App Privacy** → **Get Started**. В поле **Privacy Policy URL** впишите `https://lawbid.dev/privacy`. Ответьте про собираемые данные по `RELEASE_CHECKLIST` (раздел 4) и нажмите **Publish**.
10. Загрузите сборку (`.ipa`) через приложение **Transporter**. Через 10-30 минут она появится во вкладке **TestFlight**.
11. Во вкладке **TestFlight** создайте группу **Internal Testing**, добавьте себя и установите сборку через приложение TestFlight. Внутренних тестеров может быть до 100. Сборка живёт 90 дней.
12. Откройте версию в боковом меню. Вставьте тексты, скриншоты, **Support URL** `https://lawbid.dev/contact` и примечания для проверяющих с демо-кодами. В блоке **Build** выберите сборку.
13. Включите постепенный выпуск (см. инструкцию «Постепенный выпуск в App Store (за 7 дней)»).
14. Нажмите **Add for Review**, потом **Submit for Review**. Статус станет **In Review**.

## Куда вставить в нашей админке

В админку вставлять нечего. Числовой Apple ID приложения (**App Information** → **Apple ID**) запишите на своём Mac в файл `apps/mobile/config/prod.json`, поле `APP_STORE_ID` (файл не попадает в git).

## Как проверить

- Статус версии идёт так: **Waiting for Review**, **In Review**, **Ready for Distribution**.
- Во вкладке **TestFlight** у сборки нет предупреждений, она устанавливается на телефон.

## Частые ошибки

- Загрузили сборку до того, как создали запись приложения: Transporter ругается на bundle ID.
- Имя в поле **Name** занято другим приложением. Добавьте уточнение, потом его можно поменять.
- Не указаны демо-коды для проверяющих: приложение отклонят, потому что они не смогут войти.
- Кнопка **Add for Review** серая: не выбрана сборка, не загружены скриншоты или не опубликован **App Privacy**.

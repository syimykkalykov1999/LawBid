# Тестовые сборки: как добавлять тестировщиков

CI (`mobile-testers.yml`) отправляет сборки **только тестерам**. В магазинах для всех
ничего не меняется:
- iOS: только загрузка в TestFlight. Отправки на проверку (Submit for review) и выпуска в App Store нет.
- Android: только дорожка Internal testing. Production, closed и rollout не затрагиваются.
Продвижение в магазин остаётся отдельным ручным шагом (`mobile-release.yml`, поле `stage`).

## iPhone (TestFlight)

App Store Connect -> приложение LawBid -> TestFlight.

**Свои (до 100 человек, без проверки Apple).** Люди должны быть в вашей команде App Store Connect:
Users and Access -> Users -> «+» -> роль App Manager / Developer / Customer Support (нужен Apple ID).
Потом TestFlight -> Internal Testing -> группа -> «+» -> отметить человека. Включите
**Automatic distribution**, чтобы каждая новая сборка приходила сама.

**Друзья без Apple ID в команде (до 10 000, по e-mail или ссылке).** TestFlight -> External Testing
-> «+» -> New Group -> Testers «+»: добавить e-mail либо включить Public Link и разослать ссылку.
Первую сборку для внешней группы Apple проверяет коротко (обычно до суток); дальше сборки,
не меняющие суть, идут без новой проверки. Включите автоматическую раздачу и в этой группе.
Тестер ставит приложение TestFlight из App Store и открывает приглашение.

## Android (Play Internal testing)

Play Console -> LawBid -> Testing -> Internal testing -> Testers.

1. Create email list -> имя списка и e-mail (Google-аккаунты, до 100 человек) -> Save.
2. Отметить список галочкой.
3. Скопировать **Copy link** (ссылка для вступления) и отправить людям. Каждый открывает её один
   раз с телефона на своём Google-аккаунте и жмёт «Become a tester», потом ставит приложение из Play.
4. Дальше новые сборки приходят им как обычные обновления Google Play.

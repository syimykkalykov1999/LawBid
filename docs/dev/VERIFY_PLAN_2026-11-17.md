# Полная проверка — по шагам, не больше 3 систем за раз (владелец 17.11)

Порядок: взять пачку → полная проверка строка за строкой → найти дыры → вылечить → PR → проверить самому → следующая пачка.
В каждой пачке проверяем:
- путь данных: телефон сжимает → прямо в хранилище → в базе только ключи → другие смотрят через CDN;
- качество не теряется, нет дубликатов, кэш и ETag работают;
- база не перегружена (индексы, нет N+1, нет лишних запросов), серверы не нагружены;
- новые версии библиотек;
- внешние и внутренние системы;
- вторая сторона видит всё.

Правила:
- ничего нового не строить, внешний вид не трогать;
- то, что работает хорошо, не трогать; улучшать, только если у нас реально хуже, чем у 3–4 лучших платформ;
- НЕ ТРОГАТЬ и не портить 23 «Авто» в админке (серверы, масштаб, расходы), которые доделали вчера.

| Пачка | Системы (модули) | Статус |
|---|---|---|
| 1 | Комментарии (comments, case-comments, mentions) · Лайки/звёзды (stars) · Посты и лента (posts, feed) | идёт |
| 2 | Рилсы/видео (videos) · Истории (stories) · Подписки и рекомендации (follows, recommendations) | ⏳ |
| 3 | Дела (cases, case-history, deadlines) · Ставки (bids, bid-packs, negotiations) · Файлы и документы (files, storage, legal-documents, document-templates) | ⏳ |
| 4 | Чаты (chat, chat-saved, forward, link-preview, stickers) · Группы (groups) · Каналы (channels) | идёт (отдельный помощник) |
| 5 | Звонки (calls, presence, realtime) · Горячая линия (consultations, hotline) · Перевод (translation) | ⏳ |
| 6 | Поиск (search, public-directory, usernames) · Вопросы и ответы (legal-qa, legal) · ИИ-помощник (assistants) | ⏳ |
| 7 | Вход/регистрация/«Забыл пароль» (auth, session, verification) · Профиль и аватары (profiles, privacy-settings) · Блокировки (blocks, account-bans) | ⏳ |
| 8 | Уведомления и push (notifications, counters) · Контакты (contacts-sync) · Рефералы/награды/промо/партнёры (referrals, rewards, promotions, partners, country-partners) | ⏳ |
| 9 | Оплата (billing, subscriptions, plans, case-payments, ledger, treasury) · Отзывы и доверие (reviews, client-reviews, attorney-trust, client-badge) · Фирмы (firms, workspace) | ⏳ |
| 10 | Поддержка (support) · Жалобы и модерация (reports, moderation, media-moderation, client-fraud) · Приватность (privacy: выгрузка/удаление), crash-reports, analytics, journal | ⏳ |
| 11 | Админка — только проверка остальных разделов (кроме 23 «Авто» — их не трогать) | ⏳ |
| 12 | Версии всего + лицензии всех библиотек (пункт 232) | ⏳ |
| 13 | В целом: база (дубликаты, индексы, размер), кэш, серверы, очереди — итог | ⏳ |

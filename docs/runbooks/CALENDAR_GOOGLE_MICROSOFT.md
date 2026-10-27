# Календарь: Google Calendar и Outlook (инструкция для владельца)

Код уже в приложении, но **выключен**. Чтобы заработало, нужно один раз
создать «приложение» у Google и/или Microsoft, вставить два ключа в админку и
включить переключатель. Деньги не нужны (оба сервиса бесплатны для такого
объёма).

Что получит пользователь после включения:
- занятое время юриста в Google/Outlook блокирует запись к нему на консультацию
  (читается только «занято/свободно», названия встреч мы не видим);
- подтверждённые консультации сами появляются в его календаре и пропадают при
  отмене или переносе.

Личная ссылка-подписка (ICS) от этих шагов **не зависит** — она работает сразу
(переключатель `calendar.feed_enabled`, по умолчанию включён).

Перед началом убедитесь, что на сервере задан `SECRETS_MASTER_KEYS` (им же
шифруются ключи в разделе «Интеграции»). Адрес API по умолчанию
`https://api.lawbid.dev/api/v1`; другой можно задать переменной
`CALENDAR_API_BASE_URL`.

Адреса возврата (Redirect URI), которые нужно вписать:
- Google: `https://api.lawbid.dev/api/v1/calendar/oauth/google/callback`
- Microsoft: `https://api.lawbid.dev/api/v1/calendar/oauth/microsoft/callback`

---

## Часть 1. Google Cloud (Google Calendar)

1. Откройте https://console.cloud.google.com и войдите аккаунтом компании.
2. Сверху нажмите на выбор проекта → **New project** → имя `LawBid Calendar` →
   **Create**. Убедитесь, что проект выбран.
3. Меню **APIs & Services** → **Library** → найдите **Google Calendar API** →
   **Enable**.
4. Меню **APIs & Services** → **OAuth consent screen** (в новом интерфейсе —
   **Google Auth Platform**) → **Get started**:
   - App name: `LawBid`; User support email: почта поддержки;
   - Audience: **External**;
   - Contact information: почта владельца → согласиться с политикой → **Create**.
5. В разделе **Branding** добавьте логотип, ссылки на Privacy Policy и Terms
   (адреса страниц с сайта lawbid.dev) и домен `lawbid.dev` в Authorized domains.
6. В разделе **Data Access** → **Add or remove scopes** и добавьте два:
   - `.../auth/calendar.freebusy` (занято/свободно);
   - `.../auth/calendar.events.owned` (события в календарях, которыми владеет человек).
   Также нужны `openid` и `email` (обычно уже есть). **Save**.
7. В разделе **Clients** (или **APIs & Services → Credentials**) →
   **Create client** (**Create credentials → OAuth client ID**):
   - Application type: **Web application**; Name: `LawBid API`;
   - **Authorized redirect URIs** → **Add URI** → вставьте адрес Google из списка выше;
   - **Create**. Появятся **Client ID** и **Client secret** — скопируйте оба.
8. **Публикация (важно).** В разделе **Audience** статус сначала `Testing`: в этом
   режиме работают только добавленные вручную тестовые пользователи (до 100), а
   доступ «слетает» через 7 дней. Для всех пользователей нажмите **Publish app**.
   Для «чувствительных» разрешений Google попросит проверку (**Verification**):
   видео-демо, политика конфиденциальности, объяснение, зачем нужен календарь.
   Обычно занимает от нескольких дней до пары недель. До проверки пользователи
   видят предупреждение «Google hasn't verified this app» (можно пройти дальше,
   но лимит — 100 человек).
9. В админке LawBid: **Интеграции** → **Google Calendar (link a calendar)** →
   вставьте `Client ID` и `Client secret` → **Save** → **Test** → **Activate**
   (понадобится свежий код 2FA).
10. **Настройки** (Config) → `calendar.google_enabled` → **включить**.

## Часть 2. Microsoft Azure (Outlook / Microsoft 365)

1. Откройте https://entra.microsoft.com (Microsoft Entra admin center) и
   войдите аккаунтом компании. Если аккаунта-организации нет, создайте бесплатный
   tenant по подсказке Microsoft.
2. **Entra ID** → **App registrations** → **New registration**:
   - Name: `LawBid Calendar`;
   - Supported account types: **Accounts in any organizational directory and
     personal Microsoft accounts** (чтобы подошли и рабочие, и личные Outlook.com);
   - Redirect URI: тип **Web**, адрес Microsoft из списка выше;
   - **Register**.
3. На странице приложения скопируйте **Application (client) ID**.
4. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Delegated permissions** → отметьте `Calendars.ReadWrite`, `offline_access`,
   `openid`, `email` → **Add permissions**. (Кнопка **Grant admin consent** не
   обязательна: пользователь соглашается сам; организации с жёсткой политикой
   могут потребовать согласие своего администратора.)
5. **Certificates & secrets** → **Client secrets** → **New client secret** →
   срок 24 месяца → **Add**. Скопируйте колонку **Value** (не **Secret ID**!) —
   потом её уже не показать. Поставьте себе напоминание обновить секрет за месяц
   до окончания срока.
6. (Желательно) **Branding & properties** → заполните ссылки на Privacy/Terms и
   пройдите **Publisher verification**, иначе у людей будет надпись «unverified».
7. В админке LawBid: **Интеграции** → **Outlook calendar (link a calendar)** →
   вставьте `Application (client) ID`, `Client secret VALUE`, поле Tenant оставьте
   `common` → **Save** → **Test** → **Activate**.
8. **Настройки** → `calendar.microsoft_enabled` → **включить**.

## Как проверить

1. Включите переключатель, зайдите в приложение тестовым юристом (экран подключения
   календаря появится в приложении позже; пока подключение запускает запрос API
   `POST /calendar/connections/google/start`).
2. После подключения запишите консультацию к этому юристу и создайте в его
   Google/Outlook событие «занято» на другое время: этого времени быть в списке
   свободных слотов не должно (до минуты задержки — результат кэшируется на 60 с).
3. Подтверждённая консультация должна появиться в календаре в течение минуты.

## Если что-то пошло не так

- Человеку приходит «ссылка устарела»: он открыл её позже 10 минут. Начать заново.
- В подключении статус `needs_reauth`: человек отозвал доступ у Google/Microsoft
  или истёк секрет Microsoft. Нужно подключить календарь заново (или обновить секрет).
- Google/Outlook не отвечает: запись к юристу продолжает работать как раньше, просто
  без учёта его внешнего календаря (ожидание не дольше `calendar.busy_timeout_ms`).
- Аварийно отключить всё: выключить `calendar.google_enabled` и
  `calendar.microsoft_enabled` — никаких обращений к Google/Microsoft больше не будет.

---

## Не пришёл на консультацию (кратко)

Настройки в админке (раздел **Настройки**, префикс `consultations.no_show_`):
- `no_show_enabled` — кнопка «Не пришёл» (по умолчанию включена);
- `no_show_grace_minutes` — через сколько минут после начала можно отметить (15);
- `no_show_mark_hours` — сколько часов после конца ещё можно отметить (48);
- `no_show_dispute_hours` — сколько часов у отмеченного, чтобы оспорить (48);
- `no_show_auto_detect` — система сама предлагает отметку, если по звонку никто не
  пришёл (по умолчанию **выключено**: сначала понаблюдайте, нет ли ложных случаев —
  встреча могла пройти по обычному телефону).

Как это работает: любая сторона отмечает другую; отмеченный может оспорить; если не
оспорил — отметка становится окончательной и попадает в счётчик надёжности
(пока только хранится, на показ юристов не влияет). Оспоренные отметки в счёт не
идут, пока сотрудник не решит иначе (`POST /admin/consultation-no-shows/:id/resolve`,
нужен свежий код 2FA, действие пишется в журнал). Экран очереди споров в админке —
следующий шаг.

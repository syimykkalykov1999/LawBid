# Реестры адвокатов по 50 штатам + DC (проверка по номеру) — 2026-10-28

**Итог после постройки адаптеров (16 автоматически, 35 вручную) — в разделе «Итог автоматизации» в конце; раздел ниже — исходное исследование.**

Проверено живыми запросами (curl) 28.10.2026. «verified» = страницу/ответ реально получили; «unverified» = не смогли проверить (стена от ботов, вход по логину, динамический сайт).

## Кратко для владельца (по-русски)

- **Полностью автоматически, прямо сейчас, без ключа: 1 штат — Нью-Йорк** (открытые данные data.ny.gov, набор `eqw2-r5nb`; ключ не нужен, бесплатный app token только поднимает лимит). Адаптер `ny_open_data` уже есть. Больше ни у одного штата нет открытой базы на Socrata (проверен каталог Socrata).
- **Есть настоящий JSON без ключа и без капчи, но нужен новый адаптер (наши адаптеры умеют только GET): Индиана** (POST) — проверено. **Огайо** — JSON есть, но нужен токен сессии со страницы (неофициальный, может поломаться). **Небраска** — JSON есть, но поиск по номеру не заработал.
- **Сайт без капчи, который читается обычным запросом по номеру (нужен «читатель страницы» — отдельный адаптер): Калифорния, Колорадо, Пенсильвания, Северная Дакота, Оклахома, Орегон (нужен Referer), Вашингтон (нужны cookie), Флорида (cookie + быстро включает Cloudflare), Миссури и Миссисипи (POST-форма), Мэн/Сев. Каролина/Коннектикут/Мичиган (форма с токенами, не проверено до конца).** Итого около 15 штатов.
- **Только сайт, открыть вручную (кнопка «Открыть запись №…» работает там, где есть прямая ссылка): 20 штатов**; ссылка прямо на номер есть у CA, CO, PA, ND, WA, FL, IN, OK, MN (но капча), WI (капча), RI (нужна сессия), CT (частично), TN/WY (из поиска, не проверено).
- **Капча или защита от ботов (автоматически нельзя): Миннесота, Висконсин, DC, Канзас, Луизиана (LSBA), Теннесси, Вайоминг, Зап. Вирджиния, Южная Дакота, Нью-Джерси, Нью-Гэмпшир (вход).**
- **Нет публичного поиска по номеру / только по фамилии:** Делавэр, Вермонт, Южная Каролина (не нашли), Иллинойс, Айова, Кентукки, Мэриленд, Монтана, Нью-Мексико, Аризона, Айдахо (поиск только по фамилии), Алабама, Аляска, Гавайи, Джорджия (по номеру не подтверждено), Юта, Вирджиния (форма с Bar ID, ссылки нет), Техас (форма с номером, результат не подтвердили), Массачусетс, Невада.
- **Ключи:** ни одному штату ключ не нужен (кроме необязательного бесплатного app token у Нью-Йорка: https://data.ny.gov/profile/edit/developer_settings). Платных/ключевых государственных API не нашли. Альтернатива «платный сервис проверки с ключом» — адаптер `generic_rest`, но тут это не исследовалось.

Счёт (51 юрисдикция):
| Категория | Штатов |
|---|---|
| (a) Открытые данные Socrata | 1 (NY) |
| (b) JSON API без ключа (нужен POST-адаптер или токен) | 3 (IN, OH, NE; рабочий по номеру: IN, OH) |
| (c1) Сайт, читаем по номеру обычным запросом, без капчи | 8 (CA, CO, PA, ND, OK, OR, WA, FL) + форма POST: MS, MO |
| (c2) Сайт, форма с номером, но нужны токены/сессия или не подтверждено | ME, NC, CT, MI, RI, VA, TX, KS, AR, MA |
| (c3) Капча / защита от ботов | MN, WI, DC, TN, WY, WV, SD, NJ, LA |
| (c4) Сайт только по фамилии или номер не подтверждён | IL, IA, KY, MD, MT, NM, AZ, ID, AL, AK, HI, GA, UT, NV |
| (d) Нет публичного поиска (вход/звонок) | DE, VT, SC, NH |

«Автоматически сейчас» (работает с текущими адаптерами без правок кода): **только NY**. С небольшим новым адаптером (POST JSON / чтение HTML): IN, OH, CA, CO, PA, ND, OK, OR, WA, MS, MO — 11 штатов; FL с оговоркой (Cloudflare).

## Что умеют текущие адаптеры
`ny_open_data` — NY. `socrata` — любой набор Socrata (нет других штатов с таким набором). `generic_rest` — только GET-запрос с шаблоном URL и `{bar_number}`; POST и HTML-страницы не умеет. Для Индианы нужен POST, для остальных — разбор HTML.

## Таблица всех 51

Типы: a = открытые данные, b = JSON API, c = сайт, d = нет публичного поиска. «Адаптер» — что использовать: `ny_open_data`, `manual` (ссылка + ручная проверка) либо «новый» (нужно написать).

| Штат | Тип | URL | Ключ | Адаптер | Прямая ссылка на номер |
|---|---|---|---|---|---|
| AL | c | https://members.alabar.org/Member_Portal/Member_Portal/Member-Search.aspx | нет | manual | нет (iMIS, ViewState) |
| AK | c | https://alaskabar.org/member-directories/ | нет | manual | нет |
| AZ | c | https://www.azbar.org/FindALawyer | нет | manual | нет (в форме нет поля номера) |
| AR | c | https://attorneyinfo.aoc.arkansas.gov/info/attorney/attorneysearch.aspx | нет | manual (потом новый); есть выгрузка списка: https://attorneyinfo.aoc.arkansas.gov/info/rosters.aspx | нет (поле «Bar Number Equals», postback) |
| CA | c | https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch | нет | новый (HTML) / manual | `https://apps.calbar.ca.gov/attorney/Licensee/Detail/{number}` (verified) |
| CO | c | https://www.coloradolegalregulation.com/attorney-search/ | нет | новый (HTML) / manual | `https://www.coloradolegalregulation.com/attorney-search/attorney-information/?regnum={number}` (verified) |
| CT | c | https://lookup.jud.ct.gov/AttorneyFirm | нет | manual | `https://lookup.jud.ct.gov/AttorneyFirm/JurisDetail?jurisNumber={juris}` (unverified; форма с CSRF) |
| DE | d | https://www.desclms.org/Security/SignIn.aspx (только вход) | — | manual | нет; проверка по телефону (302) 739-4155 |
| DC | c | https://my.dcbar.org/memberdirectory | нет | manual | нет; reCAPTCHA |
| FL | c | https://www.floridabar.org/directories/find-mbr/ | нет | новый (cookie, осторожно: 429/Cloudflare) / manual | `https://www.floridabar.org/directories/find-mbr/profile/?num={number}` (работает с cookie) |
| GA | c | https://www.gabar.org/member-directory (→ gabar.reliaguide.com) | нет | manual | нет |
| HI | c | https://hsba.org/member-directory | нет | manual | нет (поиск по имени) |
| ID | c | https://isb.idaho.gov/licensing-mcle/attorney-roster-search/ | нет | manual | нет (только фамилия) |
| IL | c | https://www.iardc.org/Lawyer/Search | нет | manual | нет (нет поля номера) |
| IN | b | POST `https://courtapps.in.gov/court-apps/api/v1/roll-of-attorneys/search` тело `{"AttorneyNumber":"7187-45","Page":1}` | нет, капчи нет (verified) | новый (POST JSON) | `https://courtapps.in.gov/rollofattorneys?AttorneyNumber={NNNNN-CC}` |
| IA | c | https://www.iacourtcommissions.org/ords/f?p=106:10 | нет | manual | нет (только имя) |
| KS | c | https://directory-kard.kscourts.gov | нет | manual | нет; Cloudflare-блок |
| KY | c | https://kybar.org/For-Public/Find-a-Lawyer | нет | manual | нет (только имя) |
| LA | c | https://www.ladb.org/Search/ ; https://www.lsba.org/MD321654/MembershipDirectory.aspx | нет | manual | нет; капча у LSBA |
| ME | c | https://apps.web.maine.gov/cgi-bin/online/maine_bar/attorney_directory.pl (поле bar_number) | нет | manual (форма, не проверена: curl дал 403) | нет |
| MD | c | https://www.mdcourts.gov/attysearch | нет | manual | нет (только имя) |
| MA | c | https://www.massbbo.org/s/ | нет | manual | нет (JS-приложение, unverified) |
| MI | c | https://dir.michbar.org/ (поле P-номера) | нет | manual (внутренний JSON требует DNN-сессию) | нет |
| MN | c | https://mars.courts.state.mn.us/ | нет | manual | `https://mars.courts.state.mn.us/UserVerification.aspx?searchtype=AttyID&attyID={number}` — но reCAPTCHA |
| MS | b/c | POST `https://www.courts.ms.gov/bar/barroll/brdetail.php` с `brnum={number}` (verified) | нет, капчи нет | новый (POST form) | нет (только POST) |
| MO | c | https://mobar.org/site/content/For-the-Public/Lawyer_Directory.aspx | нет | новый (ASP.NET POST) / manual | нет (verified поле «Bar Number Equals») |
| MT | c | https://www.montanabar.org/For-Attorneys/Attorney-Directory | reCAPTCHA v3 | manual | нет (только имя) |
| NE | b | POST `https://attorneys.nejudicial.gov/api/Member/Search` (JSON) | нет | manual (фильтр по номеру не сработал, номер в ответе пустой) | нет |
| NV | c | https://nvbar.org/for-the-public/find-a-lawyer/ | ? | manual | нет (unverified) |
| NH | d/c | https://member.nhbar.org/directory (логин) | — | manual | нет |
| NJ | c | https://www.njcourts.gov (Attorney Search, за Incapsula) | — | manual | нет; 403 боту |
| NM | c | https://www.sbnm.org/For-Public/I-Need-a-Lawyer/Online-Bar-Directory | ? | manual | нет |
| NY | a | https://data.ny.gov/resource/eqw2-r5nb.json?registration_number={number} (Socrata, verified) | нет; app token необязателен | **ny_open_data** | сайт https://iapps.courts.state.ny.us/attorneyservices/search (Cloudflare, ссылки на номер нет); профиль на data.ny.gov |
| NC | c | https://portal.ncbar.gov/Verification/search.aspx (поле txtLicNum) | нет | manual (ASP.NET POST, номер не подтверждён) | нет |
| ND | c | https://www.ndcourts.gov/lawyers | нет | новый (HTML) / manual | `https://www.ndcourts.gov/lawyers/{5 цифр с нулями}` (verified) |
| OH | b | POST `https://www.supremecourt.ohio.gov/AttorneySearch/Ajax.ashx`, `action=SearchAttorney&attyReg={number}` (verified, неофициальный) | нет; нужен X-CSRF-TOKEN + cookie со страницы | новый (сессия) | нет |
| OK | c | https://my.okbar.org/member-verification/ | нет | новый (HTML) / manual | `https://my.okbar.org/member-verification/?keyword={number}` (verified) |
| OR | c | https://www.osbar.org/members/membersearch_start.asp | нет | новый (нужен Referer) / manual | `.../membersearch_display.asp?b={number}&s=1` (без Referer перекидывает на старт) |
| PA | c | https://www.padisciplinaryboard.org/for-the-public/find-attorney | нет | новый (HTML) / manual | `https://www.padisciplinaryboard.org/for-the-public/find-attorney/attorney-detail/{number}` (verified) |
| RI | c | https://rijrs.courts.ri.gov/rijrs/searchAttorney.do | нет | manual | `...searchAttorney.do?subactionId=3&attorneyNumber={n}` — нужна сессия и «I ACCEPT» (unverified) |
| SC | d? | https://www.sccourts.org/ (Attorney Search не найден; scbar.org требует вход) | — | manual | нет (unverified) |
| SD | d? | https://members.statebarofsouthdakota.com/ | — | manual | нет; Cloudflare |
| TN | c | https://www.tbpr.org/for-the-public/online-attorney-directory | нет | manual | `https://www.tbpr.org/attorneys/{BPR#}` (unverified; 403 боту) |
| TX | c | https://www.texasbar.com/AM/Template.cfm?Section=Find_A_Lawyer&Template=/CustomSource/MemberDirectory/Search_Form_Client_Main.cfm (поле BarCardNumber) | нет | manual | нет (профиль по внутреннему ContactID) |
| UT | c | https://services.utahbar.org/Licensee-Directory | нет | manual | нет (JS) |
| VT | d | https://www.vtcourts.gov/attorneys (лицензирование: AttyLicensing@vtcourts.gov) | — | manual | нет |
| VA | c | https://vsb.org/Site/Shared_Content/Directory/va-lawyer-directory.aspx (поле Bar ID) | нет | manual | нет |
| WA | c | https://www.mywsba.org/PersonifyEbusiness/LegalDirectory.aspx | нет | новый (cookie) / manual | `https://www.mywsba.org/PersonifyEbusiness/LegalDirectory/LegalProfile.aspx?Usr_ID={номер, 12 цифр с нулями}` (verified с cookie) |
| WV | c | https://wvbar.org/directory/ | ? | manual | нет; Cloudflare |
| WI | c | https://www.wisbar.org/Pages/BasicLawyerSearch.aspx | нет | manual | `https://www.wisbar.org/directories/pages/lawyerprofile.aspx?Memberid={n}` — CAPTCHA |
| WY | c | https://www.wyomingbar.org/for-the-public/hire-a-lawyer/lawyer-search/ | нет | manual | `https://www.wyomingbar.org/special/directory-profile/?id={prefix-number}` (unverified; блок бота) |

## Замечания и риски
- Ни одна коллегия не публикует официальный ключевой API; «нужен ключ» нигде. Все автоматические варианты кроме NY — парсинг публичных страниц или неофициальные эндпоинты (могут сломаться; проверить условия использования сайтов; ФЛ и OH особенно чувствительны к частоте запросов).
- Сайты, где защита от ботов (Cloudflare/Incapsula/reCAPTCHA), мы не обходили.
- Для кнопки «Открыть запись №…» подходят: CA, CO, PA, ND, OK, OR (с Referer-редиректом через форму), WA, FL, IN; остальные — ссылка на страницу поиска.
- Часть сводных отчётов исполнителей — «unverified»; перед включением штата прогнать живой тест на одном известном номере.
- Дополнительные источники: https://data.ny.gov/Transparency/NYS-Attorney-Registrations/eqw2-r5nb ; каталог Socrata https://api.us.socrata.com/api/catalog/v1 (проверен 28.10.2026, других атторней-наборов нет).

## Итог автоматизации (сделано 28.10.2026, ветка claude/state-bar-registries-all)

Каждый штат ниже проверен живым запросом **через сам адаптер** (найден / не найден) 28.10.2026, User-Agent `Mozilla/5.0 (compatible; LawBid-LicenseCheck/1.0; +https://lawbid.dev)`, пауза 3 с между запросами. Все штаты по умолчанию выключены; владелец включает каждый в админке (способ «Готовый: официальный сайт штата»).

**Автоматически: 16** (NY — открытые данные; 15 — готовые настройки `state_preset`). **Вручную: 35.**

| Штат | Итог | Как / почему |
|---|---|---|
| NY | авто | data.ny.gov `eqw2-r5nb` (ny_open_data, как было) |
| AR | авто (без статуса) | форма ASP.NET «Bar Number Equals»; статуса нет → найденная запись уходит проверяющему |
| CA | авто | профиль `apps.calbar.ca.gov/attorney/Licensee/Detail/{n}` |
| CO | авто | профиль `?regnum={n}`; robots.txt: Crawl-delay 10 → лимит 5/мин |
| FL | авто | cookie стартовой страницы + профиль `?num={n}`; Cloudflare/429 → лимит 4/мин и пауза по Retry-After |
| IN | авто | POST JSON roll-of-attorneys |
| MO | авто | форма ASP.NET (iMIS) «Bar Number Equals» |
| MS | авто (без статуса) | POST `brdetail.php brnum=`; статуса нет → проверяющему |
| NC | авто | форма ASP.NET `txtLicNum` → results.aspx |
| ND | авто | `ndcourts.gov/lawyers/{5 цифр}` |
| OH | авто | POST `Ajax.ashx` + X-CSRF-TOKEN со страницы. Сайт ничего не отвечает, если User-Agent не начинается с `Mozilla/5.0`, поэтому UA в стандартной форме ботов «compatible; …» |
| OK | авто | `member-verification/?keyword={n}`, выбирается карточка с тем же Bar ID |
| OR | авто | `membersearch_display.asp?b={n}` с Referer страницы поиска |
| PA | авто | профиль `attorney-detail/{n}` |
| TX | авто | POST поиска по Bar Card Number (8 цифр) → карточка |
| WA | авто | cookie стартовой страницы + `LegalProfile.aspx?Usr_ID={12 цифр}` |
| CT | вручную | **robots.txt `lookup.jud.ct.gov`: `Disallow: /`** — запрещён любой автоматический доступ (технически страница по номеру работает) |
| ME | вручную | **robots.txt `apps.web.maine.gov`: `Disallow: /cgi-bin/`**; к тому же справочник сам пишет, что не подтверждает good standing |
| RI | вручную | нужно нажать «I ACCEPT» (принять условия) — за пользователя не принимаем |
| NE | вручную | публичный JSON не фильтрует по номеру, номер в ответе пустой |
| MI, MA, GA, NV, UT | вручную | JS-приложения / нужна сессия сайта; поиск по номеру не подтверждён |
| MN, WI, DC, LA, MT | вручную | капча (reCAPTCHA / CAPTCHA) |
| KS, SD, WV, TN, WY, NJ, VA | вручную | защита от ботов (Cloudflare / Incapsula / 403) |
| AL, AK, AZ, HI, IA, ID, IL, KY, MD, NM | вручную | нет поиска по номеру (только имя / список) |
| DE, NH, SC, VT | вручную | нет публичного поиска (вход / телефон) |

### robots.txt и условия сайтов (проверено 28.10.2026)
- robots.txt читается **в коде перед каждым сайтом** (кэш 24 ч на хост, RFC 9309): если путь запрещён — запроса нет, лицензия уходит проверяющему. Поэтому CT и ME оставлены вручную.
- MO (mobar.org): Content-Signal `search=yes, ai-train=no, use=reference`; запрещены только AI-краулеры (GPTBot, ClaudeBot и т. п.) — наш проверяющий бот не собирает данные для обучения. MS: закрыты `/barweb/`, `/barapp/`, наш путь `/bar/barroll/` открыт. CO: `Crawl-delay: 10` — соблюдаем лимитом 5/мин.
- Условия: Florida Bar «Disclaimer & Terms of Use», PA Disciplinary Board Disclaimer, ND Courts Disclaimer, Oregon disclaimer — запрета автоматических запросов не нашли. Oklahoma Bar Terms of Use запрещают «Harvest or otherwise collect information about others» в разделе Communication Services (форумы/рассылки); единичная проверка номера, который адвокат сам указал, — не сбор базы. Условия CA, WA, TX, IN, OH, NC, AR, MO отдельной страницей не нашли (проверены robots.txt). Если владелец решит трактовать OK строже — оставить OK выключенным.

### Вежливое использование (в коде)
- Один запрос на новую лицензию + ручная перепроверка админа. Ежемесячная массовая перепроверка (`licenses.registry-recheck`) **не** трогает html_page/state_preset.
- Лимит на штат: 10/мин по умолчанию (CO 5, FL 4), настраивается в админке. Кэш ответа 24 ч. Предохранитель: 5 ошибок подряд → пауза 10 мин; HTTP 429 → пауза по Retry-After (минимум 1 мин, удваивается до 1 ч). Таймаут 8 с, ответ до 2 МБ, не больше 8 запросов на одну проверку, редиректы только на тот же хост, только https на публичный адрес.
- Ошибка реестра никогда не блокирует адвоката: `manual_review` (`provider_error`), как раньше.
- Лимит/кэш/предохранитель живут в памяти каждого процесса API (без Redis): при N задачах API худший случай — N × лимит.

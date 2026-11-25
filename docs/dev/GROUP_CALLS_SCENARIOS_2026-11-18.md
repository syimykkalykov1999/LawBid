# Групповые звонки: все сценарии (18.11.2026)

Повод: прод, телефоны владельца 18.11. После группового звонка на троих звонок 1:1 тем же людям отвечал «Абонент занят», у второго телефона приходило только уведомление, а по тапу на нём открывалось «Вы уже в звонке» с кнопкой «Завершить». После «Завершить» звонки снова шли.

Ветка `claude/group-call-busy`. Звонки 1:1 не менялись: каждое изменение стоит только в ветке группового звонка, все тесты 1:1 проходят без правок.

## Точная причина (доказано тестами)

Сервер считает человека занятым (`liveCallOf`), пока его строка в живом групповом звонке `joined` или `invited`. Строку держали две ошибки.

1. **Сервер.** Звонок 1:1, в который добавили третьего. Третий ещё звонит, а двое, кто говорил, положили трубку. В `settleHeadcount` было «никого нет в звонке, но кто-то ещё звонит: звонок остаётся». Звонок жил дальше без людей. Третий оставался `invited`, то есть занятым для любого звонка 1:1, и его телефон продолжал звонить в пустой звонок (до 65 с). То же было в звонке группового чата, если хозяин и все, кто ответил, вышли, пока остальным ещё звонило.
   Тест, падавший до правки: e2e `owner-group-calls` «owner 18.11: everyone connected hangs up while an invitee still rings…» (было `Expected "ended", Received "active"`).
2. **Приложение.** Звонок 1:1, в который добавили третьего, а тот ещё звонит. Когда один из двоих кладёт трубку, его приложение считало это «звонком двоих» (`_twoPersonCall` не смотрел на тех, кому ещё звонят) и слало «bye». Телефон второго закрывал звонок у себя **без запроса на сервер**. Сервер же держал звонок для того, кто остался (третьему ещё звонят), и строка второго оставалась `joined` до сторожа тишины (180 с). Всё это время он был «занят» для звонков 1:1, а его собственный звонок отвечал 409 «Вы уже в звонке» со ссылкой на этот висящий звонок. Это совпадает со всем, что видел владелец.
   Тесты, падавшие до правки: `call_controller_test` группа «owner 18.11: nobody stays «in a call» after a group call» (3 теста).

3. **Сервер (найдено 24.11).** Звонок 1:1, в который добавили третьего. Звонивший положил трубку, пока третьему звонят: второй остаётся ждать третьего (как в WhatsApp). Третий отклонил или не ответил. Отказ (`declineInvite`) не пересчитывал, кто остался, а сторож звонков без ответа (`endIfAlone`) смотрел только звонки группового чата и канала. Звонок жил для одного человека, и тот был «занят» для звонков 1:1, пока его собственное приложение не положит трубку (свёрнуто или убито — до сторожа тишины 180 с).
   Тест, падавший до правки: e2e `owner-group-calls` «owner 18.11: the caller left while the added person rang; that person declines or never answers…» (было `status: "active"` вместо `"ended"`). Правка: отказ и истёкший звонок пересчитывают людей (`settleHeadcount`) для любого группового звонка.

Не доказано и требует телефона: повтор «Занято» в 14:49 после удачного звонка в 14:47. Коду двух причин выше он соответствует, если в том групповом звонке был ещё один участник, которому звонили. Других путей к занятости после звонка 1:1 тесты не нашли.

## Как у других (источники)

- WhatsApp: из группового звонка можно выйти и вернуться, пока он идёт, а также войти позже, даже если звонок пропустил. После конца звонка вернуться нельзя ([Android Central, 2021](https://www.androidcentral.com/whatsapp-finally-lets-you-join-ongoing-group-video-calls); [iPhone in Canada, 19.07.2021](https://www.iphoneincanada.ca/2021/07/19/whatsapp-launches-joinable-calls-feature/)). Звонок без единого участника не держится. В пустом звонке не остаётся никого, кому могли бы звонить.
- Telegram: выход из группового звонка не заканчивает его для остальных ([core.telegram.org, phone.leaveGroupCall](https://core.telegram.org/method/phone.leaveGroupCall?layer=23)). Голосовой чат постоянный, в него входят и выходят ([telegram.org/blog/voice-chats](https://telegram.org/blog/voice-chats/ko?setln=en)). У нас так работает звонок канала.
- Google Meet: в новом групповом звонке нельзя добавлять людей по ходу, вместо этого начинают новый звонок ([support.google.com/meet/answer/15226472](https://support.google.com/meet/answer/15226472?hl=en-GB)). Пропущенный звонок записывается, даже если устройство было выключено ([support.google.com/meet/answer/15236238](https://support.google.com/meet/answer/15236238)).

Что взяли: человек, вышедший из звонка, сразу свободен. Пока в звонке есть хоть один человек, кто-то ещё звонит и можно вернуться (как сейчас). Когда в звонке никого нет, он кончается, и звонки ещё не ответившим прекращаются (WhatsApp).

## Матрица

«Работает»: было исправно и закреплено тестом. «Исправлено»: было сломано, исправлено, есть тест. «Телефон»: доказывает только живой телефон.

| # | Сценарий | До | Правка | После | Доказательство |
|---|---|---|---|---|---|
| 1 | Старт звонка в группе, звонит выбранным | работает | — | работает | e2e owner-group-chat-calls «starts from the group, rings chosen members…» |
| 2 | Без списка звонит всей группе (до вместимости) | работает | — | работает | e2e «no list = the whole group rings» |
| 3 | 3–9 человек: девятый входит, десятому «полно» | работает | — | работает | e2e «limits the size, drops a removed member…»; sfu-calls.spec «seats: SFU … 20, p2p 9» |
| 4 | Вход позже (по «Присоединиться») | работает | — | работает | e2e «red button of one person… a late join»; ctl «a member who joins later» |
| 5 | Отклонил входящий в группу | работает | — | работает | e2e «a decline … change nobody else»; «a declined invite ends nothing» |
| 6 | Нет ответа: звонок участнику снимается по таймауту | работает (кроме 12a) | см. 12a | работает | sweepInvites; ctl «the ringing never goes on forever»; e2e 12a «no answer» |
| 7 | Один вышел, остальные говорят | работает | — | работает | e2e «red button of one person: the others go on» |
| 8 | Хозяин вышел: звонок идёт, хозяином становится следующий | работает | — | работает | e2e там же («Telegram: the host leaves») |
| 9 | Остались двое, один вышел, у последнего звонок кончается | работает | — | работает | e2e owner-solo-calls «one person left: the call ends after the grace»; ctl «everyone else left: ends by itself after 3 s» |
| 10 | Все вышли по одному | работает | — | работает | e2e «everyone leaves one by one: the last press ends the call» |
| 11 | **Все, кто ответил, вышли, а кому-то ещё звонят** | **сломано**: звонок жил, звонящий в пустоту человек «занят» | сервер: `settleHeadcount` кончает звонок, когда никого нет | **исправлено** | e2e owner-group-calls «owner 18.11: everyone connected hangs up while an invitee still rings…»; e2e owner-group-chat-calls «owner 18.11: everyone who answered leaves while a member still rings…»; solo-call.spec «nobody connected ends at once, also while somebody still rings» |
| 12 | **Звонок 1:1 сделан групповым, третьему ещё звонят, один из двоих положил трубку** | **сломано**: «bye» закрывал второй телефон без сервера, он 3 мин «занят» | приложение: без «bye», пока кому-то звонят; «bye» в групповом звонке ещё и говорит серверу | **исправлено** | ctl «owner 18.11 … a «bye» does not drop this phone behind the server's back», «our hang-up while an added person rings: no «bye»», «a «bye» that ends a group call here is told to the server too» |
| 12a | **Звонок 1:1 сделан групповым, звонивший вышел, третий отклонил или не ответил** | **сломано**: оставшийся один «занят», звонок жил | сервер: отказ и истёкший звонок пересчитывают людей (`settleHeadcount`) для любого группового звонка | **исправлено** | e2e owner-group-calls «owner 18.11: the caller left while the added person rang; that person declines or never answers…» (оба варианта) |
| 13 | **Вышел, и сразу звонок 1:1 (каждый из троих)** | сломано в случаях 11, 12 и 12a | см. 11, 12, 12a | **исправлено** | e2e «owner 18.11: three talked — each one who hangs up is free for a 1:1 call at once, the last ones too» |
| 14 | Вышел и вернулся, пока звонок идёт | работает | — | работает | e2e «a call made a group: whoever left comes back while it runs»; ctl «leaving … offers the way back» |
| 15 | Вернуться в законченный звонок нельзя | работает | — | работает | ctl «the last one out is offered no way back into a finished call» |
| 16 | Два устройства одного аккаунта: ответ на одном, второе перестаёт звонить | работает | — | работает | e2e owner-calls «two devices of the callee: the first pick-up wins»; joinAsInvitee шлёт `enqueueCallEnded` на остальные устройства |
| 17 | Приложение в фоне или закрыто: звонок по пушу (CallKit, Android на весь экран) | работает | — | работает + телефон | ctl «a push for a running call we were added to rings (not dismissed)»; матрица 08.11 строки 3–17 |
| 18 | Приложение умерло посреди звонка (смахнули) | работает | — | работает | e2e «drops a member whose app went silent (swiped away)» |
| 19 | Обрыв сети и возврат, Wi-Fi ↔ LTE | работает | — | работает | ctl «a link that drops is retried while the call goes on»; ctl «S-net-switch» (14.11 №13) |
| 20 | Микрофон, громкая связь | работает | — | работает | ctl SFU «mute, camera, speaker map onto the media»; e2e group-calls (mute-state) |
| 21 | Хозяин выключил микрофон, удалил участника | работает | — | работает | e2e «adds a person … host mutes and removes»; ctl «the host mutes us», «the host removes us» |
| 22 | Добавить участника по ходу | работает | — | работает | e2e «adds a person…»; «a stranger cannot be added» |
| 23 | Звонок тому, кто уже в другом звонке: «занят» и в истории | работает | — | работает | call-waiting.spec «busy in a group call (group calls unchanged)»; e2e owner-calls «decline, busy and missed … are logged» |
| 24 | Добавить того, кто в другом звонке: отказ | работает | — | работает | `invite` → CALL_IN_PROGRESS (e2e group-calls, comment «a2 is busy with this call») |
| 25 | Начать групповой звонок, когда сам в звонке: 409 с id и «Завершить там» | работает | — | работает | ctl «409 with no local call: stays open, "end it there" ends that call» |
| 26 | Список звонков: законченные и идущие групповые | работает | — | работает | e2e owner-call-history «lists my finished calls newest first … and the running group calls» |
| 27 | Cloudflare SFU и прямая связь между телефонами | работает | — | работает | sfu_call_controller_test (весь файл); sfu-calls.spec; e2e owner-calls-cloudflare 1)–5) |
| 28 | SFU недоступен, перенос на свою связь посреди звонка | работает | — | работает | sfu_call_controller_test «a missed event: the resync swaps too»; calls-failover.spec |
| 29 | Звонок канала идёт и без людей (Telegram) | работает | — | работает | e2e owner-channel-calls |
| 30 | Голосование за удаление | работает | — | работает | e2e «vote to remove…»; ctl «vote to remove: shown, answered…» |
| 31 | Звонок 1:1 без изменений (все сценарии матрицы 08.11 и 14.11) | работает | не трогали | работает | все прежние тесты 1:1 проходят без правок; новый ctl «a plain 1:1 «bye» is unchanged» |

## Чего нет по сравнению с WhatsApp и Telegram (не строим: это новые функции, не поломки)

- Telegram: поднять руку, слушатели в больших голосовых чатах, запись звонка.
- WhatsApp: ссылка на звонок, запланированный групповой звонок.
- Google Meet: подписи (субтитры).

## Только телефон

1. Три телефона: звонок 1:1, добавить третьего, **третий не берёт**. Оба первых кладут трубку. У третьего звонок сразу стихает. Сразу же звонок 1:1 на любой из трёх: идёт вызов, не «занято».
2. То же, но третий ответил, потом все по одному положили трубку. После каждого выхода тот, кто вышел, сразу принимает звонок 1:1.
3. iPhone: после конца группового звонка зелёная плашка звонка в Dynamic Island исчезает.

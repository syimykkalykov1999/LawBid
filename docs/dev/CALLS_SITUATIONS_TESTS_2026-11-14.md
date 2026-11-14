# Звонки: все ситуации — автоматические тесты (строка 36, 14.11.2026)

Владелец 08.11: «все ~21 ситуация (айфон/Android, экран вкл/выкл/заблокирован, приложение открыто/свёрнуто/закрыто, принять/отклонить/нет ответа/сброс/плохая связь)». Каждая ситуация проверена тестом на самом глубоком уровне, какой возможен без телефона: контроллер звонка с поддельными сервером, WebRTC и сигналами (Dart), тесты нативного кода по исходникам (CallKit / ConnectionService), и e2e сервера на настоящих Postgres и Redis. Основа: `CALLS_SCENARIO_MATRIX_2026-11-08.md` (PR #838) и аудит `CALLS_AUDIT_2026-10-26.md`.

Файлы тестов: `apps/mobile/test/features/calls/` (сокращённо `ctl` = `call_controller_test.dart`) и `apps/api/test/*.e2e-spec.ts`.
**Новое в этом PR**: 5 тестов контроллера (группа «row 36 situations») и 1 e2e. Ошибок в коде звонков эти тесты не нашли, код звонков не менялся.

| # | Ситуация | Тест (уровень) | Результат 14.11 |
|---|---|---|---|
| 1 | Исходящий 1:1: звонит → ответили → разговор → положить | ctl «calling out: rings, picked up, offer/answer, talks, hangs up»; e2e owner-calls «rings, connects, relays signaling to the peer only, ends with a duration» | зелёный |
| 2 | Входящий, приложение открыто: принять | ctl «ringing in: accept answers the offer»; «a video call rings in as video and answers with the camera» | зелёный |
| 3 | Входящий, приложение открыто: отклонить | ctl «ringing in: decline tells the server and closes», «owner 2026-11-03: a decline is told to the server exactly once»; e2e owner-call-cancel-status «declines the ringing call by its ticket; the caller hears call:ended once; a replay changes nothing» | зелёный |
| 4 | Нет ответа: у звонящего 60 с → «Нет ответа» | ctl «outgoing: nobody answers and the server is unreachable»; e2e owner-calls «decline, busy and missed (sweep) are logged; missed notifies the callee» | зелёный |
| 5 | Нет ответа: у вызываемого мелодия сама стихает | ctl «incoming: no "ended" ever arrives → the ringtone stops by itself»; android_killed_ring / call_cancel_locked_android «is not shown (the native stop marked the call)» | зелёный |
| 6 | Звонящий сбросил, пока звонит (экран вкл / заблокирован) | ctl «incoming: the caller hung up while this phone had no socket»; e2e «the caller cancels: the callee gets «stop ringing», the ticket reads «ended»»; call_cancel_locked_android ««stop ringing» is native…» | зелёный |
| 7 | Вызываемый занят другим звонком | ctl «busy and refusals end at once with the reason», «busy: ends at once and goes»; **новые** ctl «S-push-busy: a push ring while talking in another call is declined…», «S-socket-busy: a socket ring while talking is not shown here»; e2e «decline, busy and missed…» | зелёный |
| 8 | Оба звонят друг другу одновременно | e2e «the decline got lost: the callee calling back declines the ringing call (the caller hears it) and rings a new one»; WebRTC: ctl «glare: the polite side (smaller id) rolls back, answers, re-offers», «glare: the impolite side ignores the offer that came» | зелёный |
| 9 | Звонящий жмёт «позвонить» второй раз | ctl «a second ring while calling is ignored»; e2e «a call the person is making or talking in still blocks a second one (409)» | зелёный |
| 10 | Ответ на втором устройстве | ctl «picked up on another of my devices: this one stops ringing»; **новый** e2e owner-calls «two devices of the callee: the first pick-up wins, the other hears it and is refused» | зелёный |
| 11 | Обрыв сети и возврат | ctl «a network drop mid-call shows reconnecting and restarts ICE», «the link comes back within 30 s: the call goes on by itself» | зелёный |
| 12 | Сеть пропала насовсем | ctl «no link for 30 s: «Call ended» by itself, the server is told» | зелёный |
| 13 | Wi-Fi ↔ 4G посреди звонка | **новый** ctl «S-net-switch: Wi-Fi → 4G mid-call takes a fresh relay list and new routes after the 1 s settle, the call goes on» | зелёный |
| 14 | Плохая связь | call_quality_test (QualityTracker, videoTierFor, tuneOpusSdp: видео тоньше, голос остаётся) | зелёный |
| 15 | Приложение закрыто / экран заблокирован: звонок по пушу (CallKit / ConnectionService) → принять | ctl «answered on the lock screen (CallKit, app killed): held», «push (app open) first, then the socket: one call screen, kept», «a push the system UI already showed (background) shows no second»; android_killed_ring «an incoming_call data push shows the system call screen» | зелёный |
| 16 | Отклонить с экрана блокировки (iPhone / Android) | callkit_decline_test (все группы); ctl «incoming: decline, and hang-up from the system sheet», «declined natively while the app slept (loaded mark): not rung» | зелёный |
| 17 | Поздний / повторный звонок уже отклонённого | ctl «declined in the app, then the late socket ring: not rung, told again»; callkit_decline «a late / repeated ring of a call declined here is not shown again» | зелёный |
| 18 | Bluetooth / наушники / громкая связь | ctl группа «headphones (owner 2026-11-04, WhatsApp)» (5 тестов); call_audio_route_test (10) | зелёный |
| 19 | Экран гаснет у уха | ctl группа «screen off at the ear (owner 2026-11-08, WhatsApp)» (8) | зелёный |
| 20 | Микрофон и камера вкл/выкл | ctl «calling out…» (mute), «a video call: camera and speaker on, camera toggles and flips», «a voice call becomes video: camera, new offer, the others told»; e2e owner-mute-calls | зелёный |
| 21 | Группа: вход / выход / последний вышел | ctl «a member who joins later…», «a member who left: their link is closed», «everyone else left: the call ends by itself after 3 s, no question»; e2e owner-group-calls, owner-group-chat-calls, owner-solo-calls | зелёный |
| 22 | Звонок тому, кто заблокировал | **новый** ctl «S-blocked: calling someone who blocked us ends with its reason»; e2e «refused before acceptance, when blocked, and for strangers» | зелёный |
| 23 | Микрофон запрещён | **новый** ctl «S-mic: the microphone refused — nobody is rung, the reason shows» | зелёный |
| 24 | Другая сторона положила трубку | ctl «the other side hangs up while we talk: call:ended closes it», «the other side hangs up: «bye» ends it here at once» | зелёный |
| 25 | Звонок «висит» на другом устройстве (409) | ctl «409 with no local call: stays open, "end it there" ends that call», «409 sheet: cancel clears it without ending anything» | зелёный |

## Прогоны (Linux, 14.11, ветка claude/calls-36)
- e2e звонков, одна база (Postgres 16 + Redis 7): 8 наборов, `Tests: 44 passed, 44 total`.
- e2e, две базы (E2E_TWO_DB=all): 43/44. Упал `owner-call-cancel-status` «the caller cancels»: «Expected number of calls: 1, Received number of calls: 3». Этот набор не входит в список CI для двух баз (`test/two-db-suites.json`). Причина — порядок наборов на общей базе: при отдельном прогоне в режиме двух баз спай видит один вызов, `Tests: 7 passed, 7 total`. Ошибки кода нет.
- `flutter analyze` (всё приложение): `No issues found!`
- `flutter test test/features/calls test/features/notifications`: все не-golden тесты зелёные, включая 5 новых. 12 golden-тестов падают только на Linux (картинки снимаются на macOS, в CI отдельная задача на macOS).

## Только телефон (тестами не доказать)
Звук через настоящий Bluetooth, системный экран CallKit на заблокированном iPhone, ConnectionService на Samsung при убитом процессе, VoIP-пуш от Apple. Список владельцу — в конце `CALLS_SCENARIO_MATRIX_2026-11-08.md`.

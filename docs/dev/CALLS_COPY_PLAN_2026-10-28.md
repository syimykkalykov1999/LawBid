# Звонки: план переноса готового кода (2026-10-28)

Шаг 1 из пункта №1 карты. Кода нет — только план: что берём, откуда, чем заменяем наше. Правило владельца: только копируем MIT/Apache/BSD; своё писать запрещено; где источника нет — «НУЖНО РАЗРЕШЕНИЕ ВЛАДЕЛЬЦА».

## Закреплённые источники (прочитаны, склонированы по тегу)

| Короткое имя | Репозиторий | Тег / коммит | Лицензия |
|---|---|---|---|
| CK | github.com/hiennguyen92/flutter_callkit_incoming | v3.1.6 / 27cd33c1665b7fbc4c8032a7866c929103029592 | MIT |
| LK | github.com/livekit/client-sdk-flutter | v2.13.2 / 7adc5959f735045261e6a81accb5cb6a9ad79a7b | Apache-2.0 |
| FW | github.com/flutter-webrtc/flutter-webrtc | v1.6.3 / 63d95f79b06ff04cb17eb871d851045f91efcaf0 | MIT |

Пути ниже — от корня репозитория источника. CK и FW у нас уже зависимости (`pubspec.yaml`), LK — нет.

## Проверка безопасности источников
- Весь код пакета CK (android/, ios/, lib/) и FW, LK (lib/, android/, ios/): чужих хостов в рабочем коде нет. Единственная отправка данных наружу — `https://events.hiennv.com/api/logs` в **example** CK: `example/ios/Runner/AppDelegate.swift:202` и `example/lib/home_page.dart:292`. **Не копировать ничего из `example/` CK целиком**; из примера брать только строки PushKit, без блока логов.
- `i.pravatar.cc`, `fastly.picsum.photos` — картинки-заглушки только в example/README CK. Не копировать.
- LK `android/build.gradle:21` подключает maven `jitpack.io` (скачивание нативных зависимостей при сборке) — если когда-либо возьмём LK, решение владельца.
- Установочных скриптов в рабочем коде нет (`lk/bootstrap.sh`, `fw/format.sh` — для разработчиков репозитория, не копируем). Podspec без script_phase/prepare_command.
- Android-манифест CK объявляет службы `phoneCall|microphone|camera` и `phoneCall` — это ожидаемо, но видео-тип службы связан с политикой Play (M7).

## Главное архитектурное наблюдение
Наша передача звука/видео — свой путь: p2p-«меш» (`call_media.dart`, `sfu_rtc.dart`) и Cloudflare SFU (`cloudflare_sfu_call_media.dart`, сервер `media-provider.ts`: только `p2p | cloudflare`). Клиент LiveKit (LK) говорит по протоколу сервера LiveKit; его переподключение, ICE-рестарт и «комната» нельзя вырезать отдельно — они работают только вместе с LiveKit-сервером. Поэтому для подключения и переподключения источник есть, **но требует решения владельца: перейти на LiveKit** (сервер уже имеет `livekit.provider.ts`) или оставить Cloudflare/p2p.

## Таблица: момент → что копируем → что заменяет

Обозначения: КОПИЯ = файл/функция берётся целиком; ЗАВИСИМОСТЬ = уже в `pubspec` как пакет, свой код поверх убираем; ЗАМЕНИТЬ = наше самописное из #519/#522, которое эталон уже покрывает; ВЛАДЕЛЕЦ = источника нет.

| # | Момент | Источник (репо : путь : функция) | Наши файлы | Статус |
|---|---|---|---|---|
| 1 | Входящий, заблокированный iPhone (аудио и видео) | CK `ios/.../SwiftFlutterCallkitIncomingPlugin.swift` `showCallkitIncoming`, `CXProvider reportNewIncomingCall`; `Call.swift`; `CallManager.swift`; `PUSHKIT.md` | `ios/Runner/AppDelegate.swift` (710 строк, самописный PushKit-блок), `callkit_bridge.dart` | КОПИЯ PushKit-обработчика из `PUSHKIT.md` + `CallkitIncomingAppDelegate.swift`; плагин — ЗАВИСИМОСТЬ. Наш AppDelegate-блок — ЗАМЕНИТЬ |
| 2 | Входящий, Android: полноэкранный экран / ConnectionService | CK `android/.../CallkitIncomingBroadcastReceiver.kt`, `CallkitIncomingActivity.kt`, `CallkitConnection.kt`, `CallkitConnectionService.kt`, `CallkitNotificationManager.kt` (`getIncomingNotification`, `showIncomingNotification`) | `CallRinging.kt` (часть), `callkit_bridge.dart` | ЗАВИСИМОСТЬ (уже используем). Лишнего самописного нет |
| 3 | Ответить | CK iOS `provider(_:perform: CXAnswerCallAction)`; Android `CallkitIncomingBroadcastReceiver` ACTION_CALL_ACCEPT → `CallkitNotificationService` | `call_controller.dart` (подписка на события), `callkit_bridge.dart` | ЗАВИСИМОСТЬ; наш код только слушает `Event.actionCallAccept` |
| 4 | Отклонить | CK iOS `CXEndCallAction` (до ответа); Android ACTION_CALL_DECLINE | то же | ЗАВИСИМОСТЬ |
| 5 | Звонящий сбросил до ответа (заблокированный экран) | CK iOS `endCall` → `reportCall(... .remoteEnded)` (стр. 460–472); Android `endCall(id)`. Известная ошибка CK 3.1.6 (M4): экран не закрывается | `CallRinging.closeRingingScreen`, `CallPushReceiver.kt`, `CallHangupReceiver.kt`, опрос `/calls/:id/status?t=` (#519/#522) | Ядро — ЗАВИСИМОСТЬ. Обход M4, нативный стоп-приёмник, опрос статуса и будильник на таймаут — **источника нет**: ВЛАДЕЛЕЦ (решить: оставить как исправление ошибки пакета и отправить PR в CK upstream, либо убрать и жить с ошибкой) |
| 6 | Завершить (после ответа) | CK iOS `CXEndCallAction`, `CallManager.endCall`; Android `CallkitNotificationService` + `endAllCalls` | `callkit_bridge.dart`, `CallForegroundService.kt` | `CallForegroundService.kt` (201 строка) — ЗАМЕНИТЬ на `CallkitNotificationService.kt` (CK, 254 строки, служба `phoneCall`) после сверки, что наш делает то же. Нативный `endAll` из #519 (M6) — ошибка CK: ВЛАДЕЛЕЦ |
| 7 | Пропущенный | CK Android `CallkitNotificationManager.showMissCallNotification`, `layout_custom_miss_notification.xml`; iOS `reportCall(... .unanswered)` | сервер шлёт `missed_call`; плагин-уведомление выключено (M-6) | КОПИЯ вариант: включить пропущенное CK (настройки в `AndroidParams`/`NotificationParams`, не код). Серверный `missed_call` с фото — ВЛАДЕЛЕЦ, если оставляем |
| 8 | Аватарка и имя ЗВОНЯЩЕГО: системный экран и верхнее уведомление | Android: CK `EXTRA_CALLKIT_AVATAR`, `createInComingAvatarTargetDefault/Custom`, `ImageLoaderProvider.kt`, `layout_custom_notification.xml`. iOS: **CallKit не умеет показывать аватарку** (только имя в `CXHandle`; Apple). | `callkit_bridge.dart` (поля `name`, `avatar`) | Android — ЗАВИСИМОСТЬ (поле `avatar`). iPhone: аватарка на системном экране — **источника нет и API нет** (ограничение Apple); верхний баннер iPhone = системный; ВЛАДЕЛЕЦ — подтвердить, что так и остаётся |
| 9 | Идущий звонок: значок/плашка | Android CK `CallkitNotificationManager.getOnGoingCallNotification`, `showOngoingCallNotification`, `layout_custom_ongoing_notification.xml`; iOS — зелёная плашка системы сама | `CallForegroundService.kt` | Android ЗАМЕНИТЬ на CK; iOS ничего писать не надо |
| 10 | Подключение (аудио/видео) | LK `lib/src/core/engine.dart` `connect`, `lib/src/core/room.dart`; FW `RTCPeerConnection`, `createOffer/Answer` | `call_media.dart` (797), `sfu_rtc.dart` (318), `cloudflare_sfu_call_media.dart` (904) | Только при переходе на LiveKit (клиент-ЗАВИСИМОСТЬ `livekit_client` pinned). Иначе источника под Cloudflare/p2p-протокол нет → ВЛАДЕЛЕЦ |
| 11 | Переподключение, ICE-рестарт | LK `engine.dart` `restartConnection` (стр. 1324), `negotiate(iceRestart:)` (349), события `RoomReconnectingEvent/ReconnectedEvent/DisconnectedEvent` (`events.dart` 76–124); FW `RTCPeerConnection.restartIce()` (`rtc_peerconnection_impl.dart:539`) | `call_media.dart` (состояние reconnecting, ICE restart, OQ-041) | Вариант A: LiveKit (всё из пакета). Вариант B (p2p): FW даёт только вызов `restartIce`, **готового сценария Wi-Fi↔4G нет** → ВЛАДЕЛЕЦ |
| 12 | Микрофон | LK `example/lib/widgets/controls.dart` (стр. 90–94, `setMicrophoneEnabled`); LK `lib/src/audio/microphone_mute_mode.dart`; FW `MediaStreamTrack.enabled = false` | `call_controls.dart`, `call_media.dart` | При LiveKit — КОПИЯ из controls.dart. Без — FW-свойство `track.enabled` (в нашем коде уже так), эталон = FW README/doc; ВЛАДЕЛЕЦ не нужен |
| 13 | Камера вкл/выкл | LK `controls.dart` стр. 98–102 (`setCameraEnabled`); `lib/src/track/local/video.dart` | `call_media.dart` | как п.12 |
| 14 | Динамик / наушники / Bluetooth | FW `lib/src/helper.dart`: `Helper.setSpeakerphoneOn` (142), `setSpeakerphoneOnButPreferBluetooth` (152), `selectAudioOutput` (128), `ensureAudioSession` (147); LK `controls.dart` `_setSpeakerphoneOn` (120), `lib/src/hardware/hardware.dart` | `call_media.dart`, `audio_session` в pubspec | КОПИЯ вызовов FW `Helper`; пакет `audio_session` дублирует — проверить и убрать. Нужны: iOS-сессия активируется CK (`didActivate audioSession`) |
| 15 | Смена камеры | FW `Helper.switchCamera(track)` (`helper.dart:59`); LK `lib/src/track/local/video.dart:299 switchCamera` | `call_media.dart` | КОПИЯ вызова FW (если не так — ЗАМЕНИТЬ) |
| 16 | Системное PiP (маленькое окно вне приложения) | **Ни в CK, ни в FW, ни в LK нет** (поиск по PictureInPicture: 0 совпадений). Возможные внешние кандидаты, НЕ проверялись: Jitsi Meet SDK (Apache-2.0), stream-video-flutter (BSD-3) | `call_pip_window.dart` (251, это окно внутри приложения, не системное) | **ВЛАДЕЛЕЦ / нужен ещё один поиск источника** |
| 17 | Разбор: стоп треков → колбэки и peer → системный звонок → UI | FW `MediaStreamTrack.stop()` (`media_stream_track_impl.dart:126`), `RTCPeerConnection.close()` (550) и `dispose()` (303); LK `Room.disconnect/dispose`; CK `endCall(id)`/`endAllCalls` | `call_controller.dart` `_finish/_reset` (порядок уже верный, M10) | Порядок совпадает с эталоном. Самописная оболочка остаётся минимальной вокруг вызовов FW/CK; ВЛАДЕЛЕЦ не нужен |

## Что из #519/#522 заменить эталоном
- AppDelegate PushKit-блок и ветки без отчёта о звонке (M1) → КОПИЯ PushKit-обработчика из CK `PUSHKIT.md` (там `showCallkitIncoming` + `completion()` на каждый пуш).
- `CallForegroundService.kt` → `CallkitNotificationService.kt` CK.
- Длительность звонка (M2) → одно значение = таймаут сервера, берём параметр CK `duration`; не код.
- Ожидание сессии на холодном старте, повторная отправка VoIP-токена (M3, M9) — наша бизнес-логика входа, не звонок: остаётся (в эталонах такого нет; это не «азбука»).

## Нужно разрешение владельца (итог)
1. Обход ошибки M4 (закрытие экрана), нативный стоп `CallPushReceiver`/`CallHangupReceiver`, нативный `endAll`, опрос `/status` + будильник — у эталона этого нет, причина — ошибка CK 3.1.6. Варианты: оставить как есть и отправить исправление в CK, или убрать.
2. Серверный `missed_call` вместо уведомления CK (п.7).
3. Аватарка звонящего на системном экране iPhone — Apple не даёт.
4. Подключение/переподключение: перейти на LiveKit (весь пункт 10–11 становится копией) или оставить Cloudflare/p2p (источника нет).
5. Системное PiP (п.16).

## Итог по моментам (17)
- Покрыто копией/зависимостью: 1, 2, 3, 4, 6 (частично), 9, 12, 13, 14, 15, 17 — 11 моментов.
- Частично, часть требует разрешения: 5, 6, 7, 8 — 4 момента.
- Нужно разрешение (нет источника): 10, 11 (без перехода на LiveKit), 16 — 3 момента (10 и 11 снимаются решением «LiveKit»).

## Дальше (шаг 2 — после ответа владельца)
Порядок: M1 PushKit (iOS) → замена CallForegroundService → FW Helper для динамика/камеры → остальное. Каждую копию — запись в THIRD_PARTY_NOTICES (CK и FW — MIT, LK — Apache-2.0 + NOTICE), перед пушем — «Известные ошибки» раздел A.

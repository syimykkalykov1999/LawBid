# Звонки, вариант A: что взято и откуда (2026-10-28)

Владелец утвердил вариант A из `CALLS_COPY_PLAN_2026-10-28.md`. Правило AGENTS.md №1: только копируем, своё — тонкая стыковка по краям.

## Источники (закреплены)

| Что | Репозиторий | Тег / коммит | Лицензия | Как взято |
|---|---|---|---|---|
| Медиа звонка (комната, переподключение, ICE, сеть, камера, микрофон, динамик) | github.com/livekit/client-sdk-flutter | v2.13.2 / 7adc5959f735045261e6a81accb5cb6a9ad79a7b | Apache-2.0 | пакет `livekit_client: 2.13.2` (точная версия в pubspec + lock) |
| CallKit + аудиосессия iPhone | github.com/livekit-examples/flutter-callkit | ab61c43432d2772c8c76981c9e8ed1f7140956b8 | Apache-2.0 | строки AppDelegate.swift (`setWebRTCAudioAvailable`, `configureCallAudioSession`, didActivate/didDeactivate) и `externalCallSystem` из lib/main.dart |
| Системный экран звонка Android/iOS | github.com/hiennguyen92/flutter_callkit_incoming | v3.1.6 / 27cd33c1665b7fbc4c8032a7866c929103029592 | MIT | весь пакет в `apps/mobile/third_party/flutter_callkit_incoming` (без example/) |
| Закрытие экрана звонка при отмене (Android) | тот же репозиторий, PR #872 | 4ae62216da7afcaf33efea9aed21d1f4a6623383 | MIT | дифф одного файла как есть |
| PiP Android | github.com/jitsi/jitsi-meet | f765042bf280cbd7dcd4a9bbdb63b09e9e4d3259 | Apache-2.0 | `PictureInPictureModule.java`, обвязка React Native заменена на простой класс |
| Сервер LiveKit + TURN | livekit/livekit-server (образ v1.13.10), уже в `infra/modules/livekit` (VM-схема из документации LiveKit) | — | Apache-2.0 | добавлен только блок `webhook` из config-sample.yaml |

## Проверка безопасности
- CK: все файлы пакета просмотрены поиском по сети/запуску процессов: наружу ходит только загрузка аватарки по ссылке, которую даём мы (OkHttp, ImageLoaderProvider). `example/` (логи на events.hiennv.com) не скопирован. Установочных скриптов нет.
- LK flutter-callkit: AppDelegate.swift и lib/main.dart прочитаны целиком: хостов нет.
- Jitsi PiP: файл прочитан целиком, хостов нет (ссылка на stackoverflow в комментарии).
- `livekit_client` Android подключает maven `jitpack.io` при сборке (было отмечено в плане как решение владельца).

## Удалено (наше, заменено)
Dart: `call_media.dart`, `sfu_rtc.dart`, `sfu_sdp.dart`, `cloudflare_sfu_call_media.dart`, `calls_sfu_api.dart`, `call_quality.dart`, `call_media_view.dart`; класс `CallForeground`; из `call_controller.dart` — вся p2p/SFU часть (ICE, офферы, меш, перезапуски, своп SFU→меш, TURN-обновление). Android: `CallRinging.kt`, `CallPushReceiver.kt`, `CallHangupReceiver.kt`, `CallForegroundService.kt`, канал `lawbid/call_service`. iOS: свой мост в RTCAudioSession.

## Своя стыковка (тонкая, по краям)
- `livekit_call_media.dart` — комната LiveKit → те же `MediaStream` для наших экранов + состояние для контроллера.
- `call_controller.dart` — бизнес-логика звонка (наш сервер, звонок/ответ/сброс, группы, голосования) осталась; медиа = комната LiveKit по токену `POST /calls/:id/livekit-token`.
- `callkit_bridge.dart` — события CK → контроллер; на Android идущий звонок теперь показывает CK (`startCall`).
- Сервер: `activeVideoProvider` выбирает LiveKit, как только заданы ключи.

## Расхождения с эталоном / не сделано
1. iPhone: CallKit-провайдер — плагин CK, а не собственный CXProvider образца LiveKit (образец — демо без id звонка, отмены, видео; README LiveKit прямо допускает CallKit-плагин). Аудио-схема LiveKit перенесена как есть.
2. iPhone: остались наши «запасной движок» для пуша в закрытое приложение и обработка VoIP-пуша `call_ended` (LC-1) — готового источника нет, без них звонок на закрытый iPhone ломается. Нужно решение владельца.
3. Системный PiP на iPhone — не делали (нет разрешённого источника).
4. Удаление серверного Cloudflare SFU/TURN/опроса статуса — НЕ сделано в этом PR (сервер просто выбирает LiveKit); отдельный PR.
5. PiP Android — квадрат 1:1, как у Jitsi (было 9:16).

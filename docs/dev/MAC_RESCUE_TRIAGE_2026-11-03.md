# Разбор незакоммиченной работы с Mac от 28.10 (ветка `claude/mac-rescue-2026-10-29`)

Метод: трёхсторонее сравнение. База `78c1d7e45` (merge-base), «Mac» = `origin/claude/mac-rescue-2026-10-29`, «main» = `origin/main` на 03.11. Для Dart обе стороны (база и Mac) пропущены через один и тот же `dart format --language-version=3.7`: если после этого разницы нет, правка только про форматирование. Для остальных сверены содержимое и `git log origin/main --since=2026-10-27 -- <путь>`.

Вердикты: **a** = новая работа, которой нет в main, переносим; **b** = устарело, в main уже есть то же или новее; **c** = локальный мусор (генерация, форматирование, личные скрипты).

Итог: **a = 1, b = 8, c = 15** (всего 24).

| Файл | Вердикт | Доказательство | Что меняет (по-русски) |
|---|---|---|---|
| scripts/dev/heavy.sh | **a** | main не менял с базы (0 коммитов), `bash -n` ок | Вторая «полоса» для тяжёлых задач на Mac: если первая занята и свободной памяти не меньше 65 %, вторая задача идёт параллельно (два `git commit` только при 70 %). Порог по умолчанию 65, заметка владельца говорила 60: задаётся `HEAVY_LANE2_MIN_RAM`. |
| apps/mobile/lib/features/chat/presentation/conversation_screen.dart | b | после одинакового форматирования Mac отличается от базы на 20 строк: `_showKeyboard`, `_keyboardH`, `panelHeight`. Всё это уже в main: коммит `109076c80` от 27.10 (в нём есть `_showKeyboard` и `panelHeight: _keyboardH`) | Переключатель смайлы↔клавиатура: клавиатура возвращается, панель берёт высоту клавиатуры и не прыгает. |
| apps/mobile/lib/features/stickers/presentation/sticker_widgets.dart | b | единственная содержательная правка (`panelHeight`, 6 строк) уже в main (`109076c80`); остальное форматирование | Панель стикеров принимает высоту клавиатуры. |
| apps/mobile/lib/features/contacts_sync/presentation/invite_contact.dart | b | SMS-приглашение (`inviteSmsUri`, `inviteUrlLauncherProvider`) есть в main (`109076c80`), версия main новее: учитывает, что контекст может быть слайвером | «Пригласить» открывает SMS с номером и нашей ссылкой, иначе общий лист «Поделиться». |
| apps/mobile/lib/features/contacts_sync/presentation/contacts_screen.dart | b | вызов `inviteContact(..., number)` уже в main; остальное форматирование | Передаёт номер в приглашение. |
| apps/mobile/test/features/contacts_sync/contacts_screen_test.dart | b | тест «Invite opens the SMS composer» уже в main; остальное форматирование | Тест SMS-приглашения. |
| apps/mobile/ios/Runner.xcodeproj/project.pbxproj | b | в main цель NotificationService уже есть (63 упоминания, база: 0), в Mac-версии 51. Mac-версия добавляет только `APP_GROUP_ID` (18 мест), а main это сознательно отложил до регистрации группы в Apple Developer (см. комментарий в NotificationService.entitlements). Перенос сломал бы подпись | Расширение уведомлений с фото отправителя. |
| apps/mobile/ios/Runner/Runner.entitlements | b | в main уже есть `aps-environment`, `time-sensitive` и `usernotifications.communication`. Mac-версия лишь добавляет `application-groups = $(APP_GROUP_ID)` (отложено, как выше) и убирает поясняющие комментарии | Права приложения для пушей и звонков. |
| apps/mobile/ios/scripts/add_notification_service.rb | b | одноразовый генератор цели NotificationService; цель уже в main (PR #417 от 26.10), описана в docs/runbooks/IOS_CHAT_NOTIFICATIONS.md | Скрипт, который добавлял расширение в проект Xcode. |
| apps/mobile/ios/Podfile.lock | c | генерируется `pod install`; в main лок не менялся с базы, CI iOS ставит поды сам | Добавляет в лок поды ML Kit (перевод, язык). |
| scripts/dev/handoff-sync.sh | c | зашиты личные пути `/Users/sima/...` и каталог scratchpad умершей сессии, пушит в ветку `claude/handoff-log` | Копировал журнал сессии в ветку передачи каждые N минут. |
| contacts_background_sync.dart, contacts_book_sync.dart, contacts_sync_providers.dart, phone_contacts.dart, contacts_book.dart, contacts_sync_repository.dart, calls_tab.dart, chats_tab.dart, contact_actions.dart, contact_rows.dart, contact_picker.dart, stickers_repository.dart, emoji_data.dart (13 файлов) | c | после одинакового `dart format` разницы с базой 0 строк: только новый стиль форматтера Dart 3.8 на Mac | Только перенос строк и скобок, поведение то же. |

Подсчёт: a = 1 (heavy.sh); b = 8 (conversation_screen, sticker_widgets, invite_contact, contacts_screen, contacts_screen_test, project.pbxproj, Runner.entitlements, add_notification_service.rb); c = 15 (Podfile.lock, handoff-sync.sh, 13 файлов только с форматированием).

Не проверено: сборка iOS и работа расширения на устройстве (нужен Mac RC-поток); `heavy.sh` проверен только `bash -n`.

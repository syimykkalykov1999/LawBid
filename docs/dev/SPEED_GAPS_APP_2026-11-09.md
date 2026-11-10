# Пробелы скорости приложения и сайта: что закрыто (09.11.2026)

Ветка `claude/speed-gaps-app`, по `docs/dev/SPEED_MATRIX_2026-11-09.md` §3 (пробелы №1, 2, 6, 7, 9, 10). Ничего нового не изобретено: везде наш же `ResumableDownload` + `CaseFileCache`, `PagedNotifier.phoneCopy`, drift-опенер социальной базы.

| Пробел (§3) | Что сделано | Тест (красный на старом коде → зелёный) |
|---|---|---|
| №1 документы постов, шаблонов и списка «Файлы» чата открывались во внешнем браузере: каждое открытие — скачивание заново | `openKeptDocument` (`cases/presentation/widgets/case_photos.dart`) → `CaseFileCache.openKept`: скачать один раз (докачка, куски), дальше открывать с диска; в браузере — как раньше. Пузырь чата — в PR #856, здесь не дублируется | `test/features/cases/kept_document_open_test.dart` |
| №2 лента дел и «Исследовать» без сохранённой первой страницы | `cachedFirstPage()` через `phoneCopy` в `FeedNotifier` и `ExploreCasesNotifier` (как у «Мои дела») | `test/features/cases/case_feed_phone_copy_test.dart` |
| №10 голосовые: один GET без Range, обрыв = скачивать заново | `downloadVoiceNote` (`chat/data/voice_files.dart`) через `ResumableDownload`: после обрыва `Range: bytes=N-`, два нажатия — один перенос | `test/features/chat/voice_download_resume_test.dart` |
| №6 сайт: сообщения и личный HTTP-кэш только в памяти вкладки | `appDriftCacheDatabase` на вебе открывает хранилище браузера (sqlite3 wasm + OPFS/IndexedDB через drift worker — тот же опенер, что у социальной базы); при выходе из аккаунта строки стираются как и раньше (`clearAccountData`); приватное окно → память вкладки | `test/core/persistence/web_cache_storage_test.dart` |

## Не сделано — и почему (точно)

**№9 обложка видео в чате.** Владелец 27.10.2026 решил обратное: коммит `ccda53168` «fix(video): cover only in profile grid, players show real frames» — плитка видео в чате (`chat_video.dart`) «никогда не рисует обложку с сервера, показывает первый кадр самого видео»; тест `reel_video_visibility_test.dart` закрепляет это для рилсов. Добавить обложку = отменить это решение и поменять вид. Что нужно, если владелец скажет «да»: (1) при отправке видео из чата снять кадр `videoFrame()` (`core/media/video_frames.dart`, уже есть) и загрузить как превью; (2) сервер: поле превью у видео-вложения (`chat.service.ts attachmentOf` уже отдаёт `previewUrl`, но `file-scan.processor.ts:174-177` для видео пишет только ширину/высоту); (3) вернуть `previewUrl` в `ChatVideoTile` под первым кадром. Поток уже кэшируется (`VideoCache`, #402), так что серый пузырь — только до первого кадра.

**№7 service worker (Workbox 7.3) для статики сайта.** Блокируют две вещи:
1. Загрузчик Flutter 3.47 (`flutter.js`, `loadServiceWorker`): если у страницы есть ЛЮБАЯ регистрация service worker, он регистрирует свой `flutter_service_worker.js?v=…` — а это заглушка, которая снимает регистрацию и один раз перезагружает вкладку (`docs/perf/WEB_PASS_2026-10-23.md` §5). Workbox-воркер в корневой области будет убит при каждом открытии. Обход — собирать с `--pwa-strategy none` (тогда `flutter_bootstrap.js` без `serviceWorkerSettings`), но тогда перестаёт работать снятие старых воркеров у посетителей со старыми сборками, ради чего заглушку оставили.
2. Решение от 23.10 (тот же §5): «кэширующий воркер — вторая история инвалидации рядом с переключением релиза»; файлы `v/<sha>/` уже `immutable` на год в HTTP-кэше, страница — `must-revalidate` + 304.
Также пакеты Workbox надо завести в `web/vendor/` с записью в `THIRD_PARTY_NOTICES.md` (с Мака npm не отдал: права на `~/.npm`). Если владелец решит делать: `--pwa-strategy none` в `web-deploy.yml`, `web/sw.js` с `workbox-sw` + `CacheFirst` только для `v/`, регистрация из `boot_end.js`, CSP `worker-src 'self'` уже есть.

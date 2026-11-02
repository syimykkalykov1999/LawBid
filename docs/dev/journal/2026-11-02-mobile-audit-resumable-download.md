# 2026-11-02 · Аудит мобилки + докачка скачивания документов

`docs/perf/MOBILE_AUDIT_2026-11-02.md` (что есть, что исправлено, что не замерено). Код: `core/files/resumable_download.dart` (Range-докачка `.part`), `CaseFileCache.download` на неё переведён; тесты `test/core/files/resumable_download_test.dart`. Не проверено на устройстве.

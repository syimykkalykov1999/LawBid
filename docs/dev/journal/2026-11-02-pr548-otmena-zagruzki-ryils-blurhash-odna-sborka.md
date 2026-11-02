# 2026-11-02 · PR #548 — отмена загрузки, рилсы, blurhash-клиент, одна сборка на телефоне

- D-9: отмена задания очереди загрузок прерывает байты (CancelToken + `cancelTaskWithId` фоновой передачи ОС); удалённое задание не возвращается как «ошибка».
- C-12: `reels_screen.dart` — `Set _seenIds`, один `setState` на страницу.
- D-8 клиент: `flutter_blurhash`, `PostMedia.blurhash` через `contractField` (`files.blurhash`); заработает, когда API отдаст поле (#553).
- Причина дубликата приложения: dev-flavor `com.lawbid.lawbid.dev` с тем же именем; правило — `docs/dev/PHONE_BUILD_RULE.md`, скрипт `scripts/dev/install-phone.sh` (только prod, перед установкой удаляет `.dev`/`.staging`).

# 2026-11-02 (PR #640): сетки «Сохранённое» и репосты профиля не пересобираются от чужих лайков

**Что искали и где.** Холодный старт, кэш картинок, пересборки чата/рилсов/ленты, память: уже есть (`PerfMarks`, `StartupIdleQueue`, `appNetworkImage`, `BuildCounter`, `select` в `PostCard`), список в `docs/perf/MOBILE_AUDIT_2026-11-02.md`. Нашлась дыра: `SavedPostsList` и список постов/репостов профиля (`social_screens.dart`) делали `ref.watch(postOverridesProvider)` целиком.

**Что сделано.** `overrideIdsWhere`/`overrideIdSet` (`social_providers.dart`): `select` по строке id постов с флагом «снято здесь». Поведение прежнее, перестройка только при изменении этого ответа. Счётчики `saved.posts`, `profile.posts`. Тест: 5 лайков на чужие посты = 0 пересборок, снятие сохранения = 1 и плитка уходит.

**Осталось / не проверено.** Архив (`settings/archive/archive_screen.dart`) тоже смотрит всю карту, но ему нужен сам переопределённый пост, не флаг; не трогал. Измерения на устройстве: HANDOFF.

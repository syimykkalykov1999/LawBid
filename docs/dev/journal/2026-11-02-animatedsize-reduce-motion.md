# 2026-11-02 — AnimatedSize с нулевой длительностью

PR: (номер в описании PR). SHA слияния: допишется после слияния.

Проблема: при включённой на телефоне настройке «убрать анимацию» `AnimatedSize(duration: Duration.zero)` в debug-сборке бросает assert «RenderAnimatedSize was mutated in its own performLayout» (воспроизведено тестом, 1 мс — не бросает). Шесть мест: форма ставки, запись сделки, подсказки упоминаний, практики, выбор опций, карточка подтверждения контакта.
Что сделано: `context.sizeChangeDuration` (в `app_entrance.dart`, рядом с `reduceMotion`): 1 мс вместо нуля. Все шесть мест переведены. Тест `test/design_system/animated_size_reduce_motion_test.dart` (виджет при `disableAnimations` + проверка по коду, что нигде нет AnimatedSize с Duration.zero; на старом коде падает).
В релизной сборке assert не срабатывает; на телефоне не проверено.

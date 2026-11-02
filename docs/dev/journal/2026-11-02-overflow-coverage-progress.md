# 2026-11-02 — покрытие экранов тестом на наезд текста (прогресс по пачкам)

Правило владельца: ничего частично. Тест: 360 dp, самые длинные тексты всех ключей, RTL, ne, de, mr, ar, ru, масштаб 1 и 1.3, плюс 4 темы (day, night, blue, green) на самом длинном тексте. Общая обвязка: `test/helpers/overflow_harness.dart`, длинные данные: `test/helpers/overflow_fixtures.dart`. Файл экрана считается покрытым, если его имя встречается в `test/`.

## Пачка 1 (`test/overflow/batch1_overflow_test.dart`)
Маршрут дела (адвокат и клиент), правка дела, дело в работе, юридический документ, папки чатов, шторки: создание, «поделиться», запросы в группу. Правка и маршрут дела клиента идут с длинным делом (название, описание, город, бюджет 999 999 999,99, закрытые детали, 4 штата).
Дело в работе (`WorkCaseScreen`) пока в состоянии по умолчанию: нужен фикстурный `attorneyCase`.

## Осталось (файлы без теста)
- Данные и шторки: `comments_sheet`, `post_text_sheet`, `post_attachments_sheet`, `story_viewer_sheets`, `story_publish_sheet`, `channel_post_card`, `sections_archive`, `case_payments_card`, `payment_request_sheet`, `client_profile_view`, `attorney_cases_tab`, `attorney_stats_screen`, `chat_video`, `contacts_states`, `demo_section`, `app_paginated_list_view`.
- Камера (нельзя отрисовать в тесте, проверять на телефоне): `id_selfie_capture_screen`, `camera_capture_screen`, `story_camera_view`; `secure_screen` (платформенный).

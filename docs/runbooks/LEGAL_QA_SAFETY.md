# Безопасность «Вопроса юристу», шаблонов и стикеров

Всё настраивается в админке: Настройки (поиск по ключу). Значения по умолчанию
не меняют поведение приложения для пользователей.

## 1. Пометка «не юридическая консультация»
Сервер сам кладёт `meta.disclaimer` ({text, version, stateCode, kind}) в ответы
вопросов/ответов, шаблонов и сроков. Ключи: `legal.disclaimer.enabled`,
`.text`, `.by_state` (JSON `{"CA":"текст"}`), `.template_extra`, `.deadline_extra`.
Приложение пока ничего не показывает (внешний вид заморожен) — когда владелец
разрешит, достаточно вывести `meta.disclaimer.text` рядом с контентом.

## 2. Личные данные в публичном вопросе
`qa.pii_mode`: off / warn (по умолчанию, только запись) / redact / block.
Что искать: `qa.pii_kinds`. Находки видны в админке (Вопрос юристу → поле
`safetyFlags`). Рекомендация для запуска: включить `redact` после недели `warn`
и просмотра ложных срабатываний. Автор получает `privacyWarnings` в ответе.

## 3. Спам
`rate_limit.question_per_day`, `rate_limit.answer_per_hour`, `rate_limit.answer_per_day`,
`qa.new_account_cooldown_hours`, `qa.max_links`, `qa.duplicate_window_days`,
`qa.duplicate_cross_user_max`, `qa.answer_duplicate_max`.
Ответ, похожий на индивидуальный совет от адвоката без лицензии в штате вопроса:
`qa.advice_flag_mode` (off / flag / hold). Значок «проверенный адвокат» сервер
считает сам (`verifiedBadge` в ответе): профиль подтверждён сейчас и есть
подтверждённая лицензия в штате вопроса.

## 4. Стикеры и CSAM
- Жалоба на пак: `POST /stickers/packs/:ref/report` (та же очередь жалоб, три
  жалобы скрывают пак).
- Новая картинка пользователя ждёт проверки (`stickers.scan_uploads`): clean —
  публикуется, flagged — ждёт решения в Модерация → Медиа, hidden/CSAM — скрыта.
- Отчёт о CSAM: `moderation.csam.ncmec_submit_enabled`. Журнал каждого отчёта —
  поле `audit` в `csam_reports` (opened, submit_skipped, submitted, manual_required,
  failed). Пока нет аккаунта NCMEC и ключей PhotoDNA, отчёты имеют статус
  `manual_required` и подаются вручную на report.cybertip.org (см.
  docs/SECURITY_TODO.md). Закон (18 U.S.C. 2258A, REPORT Act 2024) требует хранить
  материалы отчёта 1 год — файлы-доказательства не удаляются.

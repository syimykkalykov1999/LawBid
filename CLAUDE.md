## STRICT RULES (owner 2026-11-05)
Read `docs/dev/STRICT_RULES.md` at every start, after every context compaction, and whenever something is forgotten. Log every step to the local journal it names so another AI can continue. Put this rule in every subagent prompt.

# Правила для помощников ИИ

Главное: [AGENTS.md](AGENTS.md) и CI-протокол в docs/dev/PROJECT_MAP.md (раздел «ОБЯЗАТЕЛЬНО перед любым PR/пушем/слиянием»).

Журнал шагов: один файл на шаг в `docs/dev/journal/` (см. AGENTS.md), не правь PROJECT_MAP.md ради журнала.

## Строгие правила (владелец, 02.11.2026; обязательны для каждого ИИ)
Полный текст: [AGENTS.md](AGENTS.md), раздел «СТРОГИЕ ПРАВИЛА ПРОЕКТА»; режим работы с ноутом и раннерами: `docs/HANDOFF.md`, «Режим работы 2026-11-02».
Коротко: планка большого проекта, не MVP (нагрузка, скорость, экономика, тесты, живучесть по умолчанию); ничего «частично»; сначала поиск, что механика уже есть (раздел PR «Что искали и где»); перед «готов» `/code-review high`, `/security-review`, `/simplify`, `npm run precheck`, тесты на класс ошибки, запись в журнал; слияния только через диспетчера по одному, без merge queue и force-push; Mac и ноут только через Mac RC-поток; владельцу по-русски, коротко, с SHA, один вопрос за раз, без секретов; 4 попытки → «Не решено».

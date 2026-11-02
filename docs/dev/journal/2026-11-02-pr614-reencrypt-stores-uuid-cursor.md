# 2026-11-02 — messages.reencrypt: пустой uuid-курсор в reencryptStores

- Симптом: аларм `lawbid-prod-cron-job-failing` с 28.10; воркер каждые 5 минут (расписание `4-59/5 * * * *`, lane cron-heavy, attempts 1) пишет `cron job failed`: `Invalid prisma.assistantMembership.findMany() ... Error creating UUID, invalid length: expected length 32 ..., found 0`.
- Корень: `SecretsService.reencryptStores()` начинал курсор с `''` и фильтровал колонку `uuid` через `id: { gt: '' }`. Задача доходила до фазы `stores`, падала, состояние оставалось на `stores`, и так каждый тик; проход никогда не завершался (старый ключ нельзя было вывести из ротации).
- Исправление: курсор `null` на первой странице, фильтр по id добавляется только с настоящим uuid. Тест: первый запрос без `id`, второй — с последним id страницы.
- PR: #614. SHA ветки на момент зелёного CI: 51d57b09 (SHA слияния допишет диспетчер). Прод проверить после деплоя: `Здоровье системы` → проход перешифрования `done`, аларм → OK.

# 2026-11-02 · Красный `API static` на main после #553: мок логгера без `info`

Что случилось: #553 (B-18) добавил в `RealtimeGateway.afterInit` таймер-«gauge» раз в 30 с, который пишет `logger.info`. В `realtime.gateway.revocation.spec.ts` один из тестов собирал шлюз с логгером `{ setContext, warn }` без `info` и вызывал `afterInit`, таймер оставался. Через 30 с он срабатывал во время другого набора (`data-export.service.spec.ts`, 32 с) в том же jest-воркере: `TypeError: this.logger.info is not a function`, набор «failed to run». На ветке #553 это не попалось (тайминг), на main упало, и Deploy-гейт «Wait for green CI» заблокировал выкат 96530e7a.

Что сделали: в мок логгера этого теста добавлен `info: jest.fn()` (одна строка). Код шлюза не менялся.

Класс ошибки: таймер из `afterInit` + неполный мок логгера в спеке = ошибка, зависящая от времени. Остальные спеки, вызывающие `afterInit` (lifecycle, limits), мок с `info` уже имеют.

SHA слияния: допишет диспетчер.

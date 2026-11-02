# 2026-11-02 · PR #623 · Redis fail-fast: проверка кластерного режима и старта без Redis (закрывает «Не проверено» из #615, слитого как 66c7b1a6d)

SHA слияния: b362cdadd.

Проверено на живом Redis 7.0 Cluster (3 мастера, локально) и без Redis:
- Нашли две настоящие дыры в кластерном режиме: (1) `enableOfflineQueue` для `Cluster` — опция кластера, а не `redisOptions`, поэтому fail-fast в кластере не включался; (2) `pubSubClient` из #615 вызывал `Cluster.duplicate(options)`, у которого первый аргумент — стартовые узлы. Исправлено, для кластера свой путь.
- Классификатор 503 не знал «Cluster isn't ready…» и ClusterAllFailedError — кластерные отказы стали бы 500. Добавлено + тест.
- Клон pub/sub не получал обработчик ротации пароля (WRONGPASS-цикл до рестарта) — теперь `attachAuthRefresh` на клоне.
- Старт без Redis: и standalone, и кластер ждут `waitForReady` 10 с (в проверке 3 с), дальше работают в fail-fast: отказ за 0–2 мс (покрыто юнит-тестом без Redis: кластер на закрытый порт, команда отклонена < 500 мс и распознана как «Redis недоступен»).
- Тест `redis-cluster-live.spec.ts` (включается `REDIS_CLUSTER_TEST_URL`): ssubscribe/spublish через pub/sub-клон кластера.
Не проверено (нельзя без прода): ElastiCache с TLS и failover.

# Search reindex without downtime (owner 2026-10-25)

When a search index mapping/analyzer changes (bump `MAPPING_VERSION` in
`apps/api/src/modules/search/engine/search-engine.mappings.ts`), the engine
gets a **new index generation** built next to the live one and the aliases are
swapped atomically. Searches never stop. Off by default: nothing here runs
while `search.engine` = `postgres`. Cost: ~$0 (a second copy of the indexes
for a few days, a few MB to a few GB).

## Для владельца (5 строк)

1. Когда в коде меняют схему поиска, в админке «Масштаб» → «Индекс поиска» появится «Схема устарела».
2. Нажмите «Начать пересборку» (код 2FA): рядом строится новый индекс, поиск работает по старому и не останавливается.
3. Когда статус «Готов к переключению», нажмите «Переключить чтение»: система сама сверит счётчики и образцы с базой, и только потом переведёт поиск на новый индекс.
4. Позже нажмите «Переключить запись»; старый индекс хранится 7 дней (настройка `search.reindex_keep_days`), и до этого можно нажать «Откатить», потери данных не будет.
5. Удаление/анонимизация человека убирает его из всех индексов сразу (и из старого, и из нового). Второй админ не нужен, только ваш код 2FA.

## How it works (ready-made OpenSearch pieces used)

| Need | Ready piece | Our code |
|---|---|---|
| Stable names | **Index aliases**: read `<prefix>-<entity>`, write `<prefix>-<entity>-write`, physical `<prefix>-<entity>-v<N>` | names in `search-engine.mappings.ts` |
| Mappings in code | **Composable index template** `<prefix>-<entity>-tpl` (pattern `...-v*`), `_meta.mapping_version` | `templateBody()` |
| Atomic swap | one **`POST /_aliases`** with remove+add actions (`is_write_index` for the write alias) | `OpenSearchClient.swap()` |
| Engine-side copy | native **`_reindex`** task (`slices=auto`, `requests_per_second`, `version_type: external_gte`), polled via **`_tasks`** | `source=engine` |
| Safe concurrent writes | **external versioning** (`version` = load time, `external_gte`): an older write can never overwrite a newer one | `BulkOp.version` |
| Inspection | `_cat/indices`, `_cat/aliases`, `_count`, `_mget`, `random_score` sample | `layout()`, `verify()` |

Own code only where nothing ready fits: the state machine, the Postgres
backfill (documents are rebuilt from the database), the dual-write rule and
the verification against the database.

## Phases

```
building -> built -> read_swapped -> write_swapped -> completed
   \________\____________\________________\-> rolled_back / cancelled
```

* **start** (needs `search.engine` = shadow|engine, because the change log
  (outbox) is only written then): creates `-v<N+1>` of every entity from the
  template. From this moment every index write also goes to the new
  generation (dual-write).
* **build**: the `search.index` job (every minute) or the CLI backfills.
  `source=postgres` (default): batches of 500 by id, checkpoint in
  `search_index_state` (key `alias-reindex`), pauses `search.reindex_throttle_ms`
  (200) between batches; stop/restart any time. `source=engine`: native
  `_reindex` from the live index (only when the document shape is unchanged).
* **verify** (also run automatically right before the read swap): document
  counts live vs new within max(5, 1 %), a random sample of the new index must
  equal the document built from the current database row (a document whose row
  is gone or hidden counts as wrong), and sampled database rows must exist in
  the new index (at most 2 % wrong).
* **swap read**: one atomic `_aliases` call for all entities. Writes still go
  to the old generation and are dual-written to the new one.
* **swap write**: write alias moves; the old generation keeps receiving
  dual-writes so a rollback finds fresh data.
* **keep**: old generation is deleted after `search.reindex_keep_days` (7).
* **rollback** (any time before `completed`): before a swap it cancels and
  deletes the new index; after a swap both aliases go back in one call.

## GDPR

Deleting/anonymizing a user (or hiding/removing a post, case, question) fires
the outbox trigger in the same transaction; the indexer then **deletes the
document from every generation** of the entity (live, building, kept for
rollback), not only the write target. A delete also carries an external
version so a slower backfill batch cannot bring the document back. Remaining
limit: the outbox is only written while `search.engine` is not `postgres`; if
the engine is switched off for a while and back on, run
`search-reindex --sync` (or a full zero-downtime reindex) to drop leftovers.

## Admin page

Админка → Масштаб → «Индекс поиска»: versions (generations) with doc counts
and size, which one is read / write / building / kept for rollback, progress,
verification result, buttons Start / Swap / Rollback. Each needs a fresh 2FA
code (step-up) and is written to the audit log (`search.reindex_start|swap|rollback`).
No second admin.

API (super_admin): `GET /admin/system-health/search-index`,
`POST .../start` (`{source?: "postgres"|"engine"}`), `POST .../swap`, `POST .../rollback`.

## CLI (same engine, for the server console)

```sh
node dist/src/cli/search-alias.js status
node dist/src/cli/search-alias.js start [--source=postgres|engine]
node dist/src/cli/search-alias.js run        # build until done (resumable), then verify
node dist/src/cli/search-alias.js swap       # read first; run again for write
node dist/src/cli/search-alias.js rollback
```

The older `search-reindex.js` still refills the LIVE index in place (initial
fill / `--sync`); it is not zero-downtime.

## Local end-to-end check

```sh
docker run -d --name lb-os -p 9200:9200 -e discovery.type=single-node \
  -e DISABLE_SECURITY_PLUGIN=true -e DISABLE_INSTALL_DEMO_CONFIG=true \
  opensearchproject/opensearch:2.15.0
OPENSEARCH_TEST_URL=http://localhost:9200 npx jest search-alias.integration opensearch.integration
docker rm -f lb-os
```

## Troubleshooting

* Stuck in `building` with `error`: read the error in the card/`status`; the
  next minute retries from the checkpoint. A rejected document usually means a
  mapping that does not fit the document (fix the mapping, rollback, start again).
* "Verification failed": counts differ or samples differ. Wait for the outbox
  to drain (`search_outbox` empty) and press Swap again.
* Engine down during swap: nothing changes (the alias call is atomic).

## Sources (checked 2026-10-25)

* OpenSearch docs, "Index aliases" (v3.x): <https://docs.opensearch.org/3.6/im-plugin/index-alias/>
* OpenSearch docs, "Alias" API (`_aliases`, atomic actions, `is_write_index`): <https://docs.opensearch.org/latest/api-reference/alias/>
* OpenSearch docs, "Reindex data" (`_reindex`): <https://docs.opensearch.org/latest/im-plugin/reindex-data/>
* OpenSearch docs, "Index templates": <https://docs.opensearch.org/latest/im-plugin/index-templates/>

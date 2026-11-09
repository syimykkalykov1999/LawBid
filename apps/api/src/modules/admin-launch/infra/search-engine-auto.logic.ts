/**
 * «Авто» end to end for search (coordinator 2026-11-08, perf guard follow-up,
 * docs/perf/USER_API_PERF_GUARD_2026-11-08.md): switching the OpenSearch
 * domain on is half the job; `search.engine` must follow it. With
 * `search.engine_follow = auto` (default) the automation walks the existing
 * zero-downtime path (docs/runbooks/search-reindex.md, search-reindex.service):
 *
 *   domain on → shadow (the outbox starts, engine asked in the background)
 *   → reindex from Postgres (built by the cron step) → swap reads (verified
 *   first) → swap writes → engine.
 *   domain off (or no engine address) → postgres at once.
 *
 * `search.engine_follow = manual`: nothing is touched, `search.engine` is the
 * admin's (Выкл = postgres, Вкл = engine). Pure; infra-auto.service does I/O.
 */
export type SearchMode = 'postgres' | 'shadow' | 'engine';
export type ReindexPhaseLike =
  | 'building'
  | 'built'
  | 'read_swapped'
  | 'write_swapped'
  | 'completed'
  | 'rolled_back'
  | 'cancelled';

export interface SearchAutoInput {
  follow: string;
  mode: SearchMode;
  /** aws.opensearch live state. */
  domain: 'on' | 'off' | null;
  /** The engine address is known (Integrations / OPENSEARCH_URL). */
  engineConfigured: boolean;
  /** The current reindex run, null = none ever. */
  phase: ReindexPhaseLike | null;
}

export type SearchAutoAction =
  | { kind: 'set_mode'; to: SearchMode; reason: string }
  | { kind: 'start_reindex'; reason: string }
  | { kind: 'swap'; reason: string };

/** The next step, or null. Steps toward the engine wait for the hysteresis
 * (the caller); the fall-back to postgres is immediate. */
export function searchAutoStep(i: SearchAutoInput): SearchAutoAction | null {
  if (i.follow.trim().toLowerCase() !== 'auto') return null;
  const up = i.domain === 'on' && i.engineConfigured;
  if (!up) {
    return i.mode === 'postgres'
      ? null
      : {
          kind: 'set_mode',
          to: 'postgres',
          reason:
            'Поисковый движок выключен или без адреса: поиск вернулся в базу.',
        };
  }
  if (i.mode === 'postgres') {
    return {
      kind: 'set_mode',
      to: 'shadow',
      reason:
        'Поисковый движок включён: поиск пишет изменения в движок и сверяет ответы.',
    };
  }
  if (i.mode === 'engine') return null;
  // shadow: build, verify, cut over
  if (
    i.phase === null ||
    i.phase === 'rolled_back' ||
    i.phase === 'cancelled'
  ) {
    return { kind: 'start_reindex', reason: 'Строится индекс поиска из базы.' };
  }
  if (i.phase === 'built' || i.phase === 'read_swapped') {
    return {
      kind: 'swap',
      reason:
        i.phase === 'built'
          ? 'Индекс построен: проверка и перевод чтения на новый индекс.'
          : 'Чтение на новом индексе: перевод записи.',
    };
  }
  if (i.phase === 'write_swapped' || i.phase === 'completed') {
    return {
      kind: 'set_mode',
      to: 'engine',
      reason: 'Индекс проверен и переключён: поиск отвечает движок.',
    };
  }
  return null; // building: the cron step advances it
}

/** Key of an action for the hysteresis map. */
export const searchActionKey = (a: SearchAutoAction): string =>
  a.kind === 'set_mode' ? `search:${a.kind}:${a.to}` : `search:${a.kind}`;

/** The fall-back needs no waiting; every step toward the engine does. */
export const searchActionImmediate = (a: SearchAutoAction): boolean =>
  a.kind === 'set_mode' && a.to === 'postgres';

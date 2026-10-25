/**
 * Shard-ready step 10: plain-Russian words for the «Разделить базу» block
 * on the system-health page (owner: «я не понимаю серверы и базы»).
 */
export interface Readiness {
  toDb: string;
  configured: boolean;
  reachable: boolean;
  migrationsApplied: boolean;
  missingMigrations: number;
  crossFamilyFksLeft: number;
  ok: boolean;
  problems: string[];
}

export interface MoveLike {
  state: string;
  status: string;
  percent: number;
  note: string;
  error: string | null;
  logicalShard: number;
  cleanupAfter: string | null;
}

const STATE_WORDS: Record<string, string> = {
  preflight: 'Проверка перед стартом',
  copy: 'Копирование данных',
  catchup: 'Докачка изменений',
  freeze: 'Короткая пауза записи',
  verify: 'Сверка количества и контрольных сумм',
  flip: 'Переключение на новый сервер',
  cleanup: 'Старые данные хранятся 7 дней',
  done: 'Готово',
};

export function stateWord(state: string): string {
  return STATE_WORDS[state] ?? state;
}

export function statusWord(m: Pick<MoveLike, 'status' | 'state'>): string {
  switch (m.status) {
    case 'running':
      return stateWord(m.state);
    case 'waiting':
      return 'Переехало. Старые данные хранятся 7 дней';
    case 'failed':
      return 'Остановлено из-за ошибки';
    case 'done':
      return 'Готово, старые данные удалены';
    case 'rolled_back':
      return 'Откатано назад';
    default:
      return m.status;
  }
}

/** «около 3 мин», «около 2 ч 10 мин», «меньше минуты». */
export function etaWord(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 60) return 'меньше минуты';
  const min = Math.round(seconds / 60);
  if (min < 60) return `около ${min} мин`;
  const h = Math.floor(min / 60);
  const rest = min % 60;
  return rest ? `около ${h} ч ${rest} мин` : `около ${h} ч`;
}

/** The checklist shown before the button: [label, passed]. */
export function readinessChecks(r: Readiness): Array<[string, boolean]> {
  return [
    ['Новая база прописана в настройках (DATABASE_URL_SHARDS)', r.configured],
    ['Новая база отвечает', r.reachable],
    [
      r.missingMigrations > 0
        ? `Схема обновлена (не хватает ${r.missingMigrations} обновлений)`
        : 'Схема обновлена (миграции применены)',
      r.migrationsApplied,
    ],
  ];
}

/** Moves the screen shows: anything not finished, newest first. */
export function activeMoves<T extends { status: string }>(moves: T[]): T[] {
  return moves.filter((m) => ['running', 'waiting', 'failed'].includes(m.status));
}

/** Rollback is offered until the old rows are deleted. */
export function canRollback(m: Pick<MoveLike, 'status'>): boolean {
  return ['running', 'waiting', 'failed'].includes(m.status);
}

export function summarize(moves: Array<Pick<MoveLike, 'status' | 'percent'>>): {
  total: number;
  finished: number;
  failed: number;
  percent: number;
} {
  const total = moves.length;
  const finished = moves.filter((m) => m.status === 'waiting' || m.status === 'done').length;
  const failed = moves.filter((m) => m.status === 'failed').length;
  const percent = total === 0 ? 0 : Math.round(moves.reduce((n, m) => n + m.percent, 0) / total);
  return { total, finished, failed, percent };
}

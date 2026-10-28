import type { components } from '@/lib/api/schema';
import { etaWord } from '@/lib/shard-split';

/**
 * Owner 2026-10-27: the guided «Разделить базу» card on «Масштаб» (switch
 * scale.db_split_enabled). Read-only: it words the readiness probes the API
 * already has (/admin/shards/overview, /admin/shards/split-plan) as a step
 * list, and names the exact commands and the guide. The move itself stays
 * on «Здоровье системы» (one 2FA code). Pure, so it is tested without a
 * browser.
 */
export type ShardsOverview = components['schemas']['ShardsOverviewDto'];
export type SplitPlan = components['schemas']['SplitPlanDto'];

export const DEFAULT_TARGET_DB = 'db1';

export interface SplitStep {
  id: 'configured' | 'reachable' | 'migrations' | 'plan';
  label: string;
  /** true = done, false = not yet, null = not checked yet. */
  state: boolean | null;
  note: string;
}

interface Readiness {
  configured?: boolean;
  reachable?: boolean;
  migrationsApplied?: boolean;
  missingMigrations?: number;
  crossFamilyFksLeft?: number;
  ok?: boolean;
  problems?: string[];
}

const readinessOf = (plan: SplitPlan | undefined): Readiness => (plan?.readiness ?? {}) as Readiness;

/** The step list: what the overview knows at once, the rest after «Проверить». */
export function dbSplitSteps(overview: ShardsOverview | undefined, plan: SplitPlan | undefined, toDb = DEFAULT_TARGET_DB): SplitStep[] {
  const r = readinessOf(plan);
  const configured = overview ? overview.databases.includes(toDb) : r.configured ?? null;
  const checked = plan !== undefined;
  const fks = r.crossFamilyFksLeft ?? 0;
  return [
    {
      id: 'configured',
      label: `Вторая база «${toDb}» прописана в секрете DATABASE_URL_SHARDS`,
      state: configured,
      note: configured === false ? 'Создайте вторую базу и добавьте её адрес в секрет; API и worker перечитают его после перезапуска.' : 'Имя базы, не адрес: сам адрес здесь никогда не показывается.',
    },
    {
      id: 'reachable',
      label: 'Вторая база отвечает',
      state: checked ? !!r.reachable : null,
      note: checked ? (r.reachable ? 'Соединение есть.' : 'Нет соединения: проверьте группу безопасности и адрес.') : 'Проверяется кнопкой «Проверить».',
    },
    {
      id: 'migrations',
      label: 'Схема второй базы совпадает с главной (миграции применены)',
      state: checked ? !!r.migrationsApplied : null,
      note: checked
        ? r.migrationsApplied
          ? 'Все миграции применены.'
          : `Не хватает ${r.missingMigrations ?? '?'} миграций: выполните prisma migrate deploy на второй базе.`
        : 'Проверяется кнопкой «Проверить».',
    },
    {
      id: 'plan',
      label: 'План чистый: нет остатков старых связей и помех',
      state: checked ? !!r.ok && fks === 0 : null,
      note: checked
        ? r.ok && fks === 0
          ? plan
            ? `Переедет частей: ${plan.shards.length}, строк: ${plan.rows.toLocaleString('ru-RU')}, время ${etaWord(plan.estimatedSeconds)}.`
            : 'Готово.'
          : (r.problems ?? []).join('; ') || (fks > 0 ? `Осталось связей между семействами: ${fks}.` : 'План не чистый.')
        : 'Проверяется кнопкой «Проверить».',
    },
  ];
}

/** Every step done → the move may be started (on «Здоровье системы»). */
export const allStepsDone = (steps: readonly SplitStep[]): boolean => steps.every((s) => s.state === true);

/** The read-only commands of the runbook, for the owner to paste. */
export function splitCommands(toDb = DEFAULT_TARGET_DB): string[] {
  return [
    `npm run shard:move --workspace apps/api -- readiness ${toDb}`,
    `npm run shard:move --workspace apps/api -- split-plan ${toDb}`,
    `npm run shard:move --workspace apps/api -- plan 200 ${toDb}`,
  ];
}

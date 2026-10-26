import type { CostEntry, CostState } from './cost-registry';

/**
 * Status dot of a registry row (owner 2026-10-26): green = works now,
 * grey = off or waiting for its hour, yellow = look at it. Pure: every input
 * comes from sources the app already keeps cheaply (app settings, the worker
 * heartbeat, the usage snapshot, the capacity reading, the economy state, the
 * cached AWS budget reading). No CloudWatch call per row.
 */
export type RowLive = 'active' | 'idle' | 'attention';

export interface RowStatus {
  state: CostState;
  live: RowLive;
  /** One Russian phrase, shown on hover / tap. */
  reason: string;
  checkedAt: string;
}

export type UsageLevelLike = 'ok' | 'warn' | 'crit';

export interface StatusSignals {
  /** The newest worker heartbeat is fresh (null = unknown). */
  workerAlive: boolean | null;
  heavyPaused: boolean;
  economyLimited: boolean;
  /** AWS month-to-date ÷ budget limit (null = not read). */
  budgetRatio: number | null;
  /** Resource pressures now: db_cpu, db_connections, redis_memory. */
  pressures: string[];
  bunny: UsageLevelLike | null;
  cloudflare: UsageLevelLike | null;
  /** Hours since the usage poll last ran (null = never / unknown). */
  usageAgeHours: number | null;
}

export interface StatusInput {
  entry: CostEntry;
  /** Live position of the switch (null = could not be read). */
  state: CostState | null;
  stateKnown: boolean;
  stateNote: string | null;
  signals: StatusSignals;
  now: Date;
}

const out = (
  now: Date,
  state: CostState,
  live: RowLive,
  reason: string,
): RowStatus => ({ state, live, reason, checkedAt: now.toISOString() });

export function computeRowStatus(i: StatusInput): RowStatus {
  const { entry: e, signals: s, now } = i;
  const state: CostState = i.state ?? e.defaultState;
  const o = (live: RowLive, reason: string) => out(now, state, live, reason);

  // 1. Cannot read the switch, or it holds a value the page does not know.
  if (i.state === null && e.control.type === 'ssm-mode') {
    return o('attention', i.stateNote ?? 'Переключатель в AWS не прочитан.');
  }
  if (!i.stateKnown && i.stateNote) {
    return o(
      'attention',
      'В настройке стоит своё значение, не совпадающее с переключателем.',
    );
  }

  // 2. Item-specific signals.
  switch (e.id) {
    case 'vendor.bunny':
    case 'vendor.cloudflare_calls': {
      const level = e.id === 'vendor.bunny' ? s.bunny : s.cloudflare;
      const what =
        e.id === 'vendor.bunny' ? 'трафик Bunny' : 'трафик звонков Cloudflare';
      if (state === 'on')
        return o(
          'attention',
          'Остановка включена вручную: новые загрузки / групповые звонки уже на запасном пути.',
        );
      if (level === 'crit') {
        return state === 'auto'
          ? o(
              'attention',
              `${what} на срочном уровне: Авто уже остановило платное.`,
            )
          : o('attention', `${what} на срочном уровне, а остановка выключена.`);
      }
      if (level === 'warn')
        return o('attention', `${what} дошёл до предупреждения.`);
      return state === 'off'
        ? o('idle', 'Остановка выключена, расход в норме.')
        : o('idle', 'Расход в норме, остановка ждёт срочного уровня.');
    }
    case 'aws.rds':
    case 'aws.db_autoscale': {
      const hot = s.pressures.some(
        (p) => p === 'db_cpu' || p === 'db_connections',
      );
      if (hot) {
        return o(
          'attention',
          state === 'auto' && e.id === 'aws.db_autoscale'
            ? 'База под нагрузкой: Авто сейчас поднимет размер.'
            : 'База под нагрузкой (процессор или соединения).',
        );
      }
      if (e.id === 'aws.db_autoscale') {
        if (state === 'off')
          return o('idle', 'Автомасштаб выключен: размер не меняется сам.');
        if (state === 'on')
          return o('idle', 'Пробный режим: только письма, что бы он сделал.');
        return o('idle', 'Нагрузка спокойная, размер базы не меняется.');
      }
      return o('active', 'База работает, нагрузка в норме.');
    }
    case 'aws.redis':
    case 'aws.redis_autoscale': {
      const hot = s.pressures.includes('redis_memory');
      if (hot) {
        return o(
          'attention',
          state === 'auto' && e.id === 'aws.redis_autoscale'
            ? 'Памяти Redis не хватает: Авто сейчас поднимет размер.'
            : 'Памяти Redis не хватает.',
        );
      }
      if (e.id === 'aws.redis_autoscale') {
        if (state === 'off')
          return o('idle', 'Автомасштаб выключен: размер не меняется сам.');
        if (state === 'on')
          return o('idle', 'Пробный режим: только письма, что бы он сделал.');
        return o('idle', 'Памяти хватает, размер Redis не меняется.');
      }
      return o('active', 'Redis работает, памяти хватает.');
    }
    case 'aws.capacity_ceiling':
    case 'hidden.economy_tick':
    case 'hidden.cost_explorer_reads':
      if (s.economyLimited)
        return o(
          'attention',
          'Расходы выше допустимых: «Экономика» включила ограничения.',
        );
      if (e.id === 'aws.capacity_ceiling' && state === 'off')
        return o('idle', 'Выключено: действует только потолок из Terraform.');
      return o('active', 'Работает, расходы в пределах допустимых.');
    case 'aws.budgets_anomaly':
      if (s.budgetRatio !== null && s.budgetRatio >= 0.8) {
        return o(
          'attention',
          `Потрачено ${Math.round(s.budgetRatio * 100)} % месячного бюджета AWS.`,
        );
      }
      return o('active', 'Бюджет под присмотром, расход в пределах месячного.');
    case 'hidden.cron_jobs':
      if (s.workerAlive === false)
        return o(
          'attention',
          'Сервер фоновых задач не отвечает: задачи не идут.',
        );
      if (s.heavyPaused)
        return o(
          'attention',
          'Тяжёлые задачи сейчас на паузе: база тормозила.',
        );
      return state === 'off'
        ? o('active', 'Задачи идут, автопауза при тормозах базы выключена.')
        : o(
            'active',
            'Задачи идут, пауза включится сама, если база затормозит.',
          );
    case 'hidden.usage_poll':
      if (s.usageAgeHours === null)
        return o('attention', 'Опрос расхода ещё ни разу не выполнялся.');
      if (s.usageAgeHours > 36)
        return o('attention', 'Опрос расхода не выполнялся больше суток.');
      return o('active', 'Опрос расхода выполняется раз в сутки.');
    case 'hidden.autoscale_lambdas':
      return state === 'off'
        ? o('idle', 'Автомасштаб выключен: запуски ничего не меняют.')
        : o('active', 'Запускаются каждые 5 минут, смотрят нагрузку.');
    default:
      break;
  }

  // 3. General rule.
  if (state === 'off') return o('idle', 'Выключено, ждёт своего часа.');
  if (state === 'auto')
    return o('idle', 'Авто: включится само, когда понадобится.');
  return o('active', 'Работает сейчас.');
}

/**
 * Owner 14.11: every «Авто» number of the Redis and database autoscalers is
 * changeable from the admin, without a Terraform apply. The admin writes a
 * JSON object into SSM `<prefix>/tuning`; the Lambda reads it on every run
 * over its Terraform TUNING (the defaults), keeping only keys of its own
 * `lambda/tuning_schema.json` inside their bounds. This table IS that file
 * (autoscale-tuning.spec.ts compares them); edit both together.
 */
export type TuningKind = 'number' | 'integer' | 'flag';
export interface TuningKnob {
  ru: string;
  min: number;
  max: number;
  kind: TuningKind;
}
export type AutoscaleTarget = 'db' | 'redis' | 'endpoints' | 'ecs' | 'spot';

/**
 * Owner 15.11 («надеюсь я могу настраивать количество серверов авто спот и
 * тд … сделай настраиваемыми»): per ECS service the fewest tasks
 * (`<kind>.min_tasks`, RegisterScalableTarget MinCapacity, applied by the API
 * on save) and the Spot split (`<kind>.spot_base` regular tasks first, then
 * `<kind>.fargate_weight` : `<kind>.spot_weight`, the capacity provider
 * strategy). Bounds are AWS's (CapacityProviderStrategyItem: base 0–100000,
 * weight 0–1000). The floor is at least 1: 0 would stop the service (the
 * pooler and api-admin included, so the admin could not undo it).
 */
export const ECS_CAPACITY_KINDS = [
  'api',
  'worker',
  'admin',
  'api_admin',
  'pgbouncer',
] as const;
export type EcsCapacityKind = (typeof ECS_CAPACITY_KINDS)[number];
const CAPACITY_RU: Record<EcsCapacityKind, string> = {
  api: 'API',
  worker: 'Фоновый сервер',
  admin: 'Админка',
  api_admin: 'API админки',
  pgbouncer: 'Пул соединений',
};
/** Spot split when nothing is set: Terraform's spot_strategy (stack). */
export const DEFAULT_SPOT_SPLIT = { base: 1, fargate: 1, spot: 4 } as const;

function ecsCapacityKnobs(): Record<string, TuningKnob> {
  const out: Record<string, TuningKnob> = {};
  for (const k of ECS_CAPACITY_KINDS) {
    const n = CAPACITY_RU[k];
    out[`${k}.min_tasks`] = {
      ru: `${n}: серверов не меньше (минимум)`,
      min: 1,
      max: 1000000000,
      kind: 'integer',
    };
    out[`${k}.spot_base`] = {
      ru: `${n}: сколько первых серверов всегда обычные (не Spot)`,
      min: 0,
      max: 100000,
      kind: 'integer',
    };
    out[`${k}.fargate_weight`] = {
      ru: `${n}: доля обычных среди остальных (вес)`,
      min: 0,
      max: 1000,
      kind: 'integer',
    };
    out[`${k}.spot_weight`] = {
      ru: `${n}: доля Spot среди остальных (вес; 0 — без Spot)`,
      min: 0,
      max: 1000,
      kind: 'integer',
    };
  }
  return out;
}

/** The Spot split of one service: the admin's numbers over the default. */
export function spotSplit(
  tuning: Record<string, number>,
  kind: EcsCapacityKind,
): { base: number; fargate: number; spot: number } {
  return {
    base: tuning[`${kind}.spot_base`] ?? DEFAULT_SPOT_SPLIT.base,
    fargate: tuning[`${kind}.fargate_weight`] ?? DEFAULT_SPOT_SPLIT.fargate,
    spot: tuning[`${kind}.spot_weight`] ?? DEFAULT_SPOT_SPLIT.spot,
  };
}

/** Kinds whose Spot split the admin has set (any of the three numbers). */
export function splitKinds(tuning: Record<string, number>): EcsCapacityKind[] {
  return ECS_CAPACITY_KINDS.filter((k) =>
    ['spot_base', 'fargate_weight', 'spot_weight'].some(
      (f) => typeof tuning[`${k}.${f}`] === 'number',
    ),
  );
}

/**
 * Checks across keys of the ECS numbers after the merge (owner 15.11): the
 * floor is not above the owner's ceiling `scale.max_tasks.<kind>`, and a
 * split keeps at least one weight above 0 (AWS: "at least one of the
 * capacity providers must have a weight value greater than zero").
 */
export function checkEcsCapacity(
  tuning: Record<string, number>,
  maxTasks: Partial<Record<EcsCapacityKind, number>>,
): string[] {
  const errors: string[] = [];
  for (const k of ECS_CAPACITY_KINDS) {
    const min = tuning[`${k}.min_tasks`];
    const max = maxTasks[k];
    if (typeof min === 'number' && typeof max === 'number' && min > max) {
      errors.push(`${k}.min_tasks: не больше максимума ${max}`);
    }
    const s = spotSplit(tuning, k);
    if (s.fargate + s.spot === 0) {
      errors.push(`${k}.spot_weight: обе доли 0`);
    }
  }
  return errors;
}

export const AUTOSCALE_TUNING_SCHEMA: Record<
  AutoscaleTarget,
  Record<string, TuningKnob>
> = {
  redis: {
    down_cooldown_h: {
      ru: 'Уменьшение: не раньше чем через столько часов после изменения',
      min: 0,
      max: 1000000000,
      kind: 'number',
    },
    down_cpu_max_pct: {
      ru: 'Уменьшение: процессор весь этот срок ниже, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    down_mem_max_pct: {
      ru: 'Уменьшение: память весь срок ниже, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    down_on_tick: {
      ru: 'Уменьшать на каждом проходе (1) или только ночью (0)',
      min: 0,
      max: 1,
      kind: 'flag',
    },
    down_window_h: {
      ru: 'Уменьшение: сколько часов нагрузка должна быть низкой',
      min: 0,
      max: 1000000000,
      kind: 'number',
    },
    night_end_h: {
      ru: 'Окно уменьшения: до какого часа (по Чикаго, не включая)',
      min: 0,
      max: 24,
      kind: 'integer',
    },
    night_start_h: {
      ru: 'Окно уменьшения: с какого часа (по Чикаго)',
      min: 0,
      max: 23,
      kind: 'integer',
    },
    single_node_up: {
      ru: 'Одиночный узел (без копии) тоже растёт: 1 — да, 0 — нет',
      min: 0,
      max: 1,
      kind: 'flag',
    },
    single_up_points: {
      ru: 'Одиночный узел: сколько 5-минутных точек подряд нужна перегрузка',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    target_cpu_max_pct: {
      ru: 'Меньший размер: процессор на нём будет не выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    target_mem_used_max_pct: {
      ru: 'Меньший размер: память на нём будет не выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_conn_pct: {
      ru: 'Письмо: соединений выше, % от предела',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_cooldown_min: {
      ru: 'Рост: пауза после любого изменения, минут (0 — без паузы)',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    up_cpu_pct: {
      ru: 'Рост: процессор выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_cpu_points: {
      ru: 'Рост: сколько 5-минутных точек подряд держится нагрузка',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    up_mem_fast_pct: {
      ru: 'Рост сразу: одна точка памяти выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_mem_pct: {
      ru: 'Рост: память занята выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_mem_points: {
      ru: 'Рост: сколько точек подряд держится память',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
  },
  endpoints: {
    cooldown_h: {
      ru: 'Пауза между изменениями, часов',
      min: 0,
      max: 1000000000,
      kind: 'number',
    },
    down_days: {
      ru: 'Убрать: сколько дней подряд трафик ниже',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    down_gb_per_day: {
      ru: 'Убрать точки доступа: трафик ниже, ГБ в день',
      min: 0,
      max: 1000000000,
      kind: 'number',
    },
    up_gb_per_day: {
      ru: 'Создать точки доступа: трафик через NAT выше, ГБ в день',
      min: 0,
      max: 1000000000,
      kind: 'number',
    },
    up_hours: {
      ru: 'Создать: сколько часов подряд трафик выше',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
  },
  // No Lambda here: the API applies these with PutScalingPolicy
  // (AwsOpsService.applyScaling); `<policy>.<target|in_s|out_s>`. CPU
  // targets from 0.1 % (15.11): AWS takes any double (TargetTrackingScaling-
  // PolicyConfiguration.TargetValue), and a live test on an idle service
  // (pooler ~0.7 % CPU) needs a target under 1 %.
  ecs: {
    'api_cpu.target': {
      ru: 'API: процессор, % — цель',
      min: 0.1,
      max: 100,
      kind: 'number',
    },
    'api_cpu.in_s': {
      ru: 'API: процессор — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'api_cpu.out_s': {
      ru: 'API: процессор — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'worker_cpu.target': {
      ru: 'Фоновый сервер: процессор, % — цель',
      min: 0.1,
      max: 100,
      kind: 'number',
    },
    'worker_cpu.in_s': {
      ru: 'Фоновый сервер: процессор — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'worker_cpu.out_s': {
      ru: 'Фоновый сервер: процессор — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'api_requests.target': {
      ru: 'API: запросов на сервер в минуту — цель',
      min: 1,
      max: 1000000000,
      kind: 'number',
    },
    'api_requests.in_s': {
      ru: 'API: запросов на сервер в минуту — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'api_requests.out_s': {
      ru: 'API: запросов на сервер в минуту — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'api_sockets.target': {
      ru: 'API: открытых сокетов на сервер — цель',
      min: 1,
      max: 1000000000,
      kind: 'number',
    },
    'api_sockets.in_s': {
      ru: 'API: открытых сокетов на сервер — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'api_sockets.out_s': {
      ru: 'API: открытых сокетов на сервер — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'worker_queue.target': {
      ru: 'Фоновый сервер: задач в очереди на сервер — цель',
      min: 1,
      max: 1000000000,
      kind: 'number',
    },
    'worker_queue.in_s': {
      ru: 'Фоновый сервер: задач в очереди на сервер — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'worker_queue.out_s': {
      ru: 'Фоновый сервер: задач в очереди на сервер — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'admin_cpu.target': {
      ru: 'Админка: процессор, % — цель',
      min: 0.1,
      max: 100,
      kind: 'number',
    },
    'admin_cpu.in_s': {
      ru: 'Админка: процессор — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'admin_cpu.out_s': {
      ru: 'Админка: процессор — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'api_admin_cpu.target': {
      ru: 'API админки: процессор, % — цель',
      min: 0.1,
      max: 100,
      kind: 'number',
    },
    'api_admin_cpu.in_s': {
      ru: 'API админки: процессор — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'api_admin_cpu.out_s': {
      ru: 'API админки: процессор — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'pgbouncer_cpu.target': {
      ru: 'Пул соединений: процессор, % — цель',
      min: 0.1,
      max: 100,
      kind: 'number',
    },
    'pgbouncer_cpu.in_s': {
      ru: 'Пул соединений: процессор — пауза перед уменьшением, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    'pgbouncer_cpu.out_s': {
      ru: 'Пул соединений: процессор — пауза перед новым ростом, секунд',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    // Owner 15.11 («сделай настраиваемыми»): the floor and the Spot split
    // of every service (ECS_CAPACITY_KNOBS below).
    ...ecsCapacityKnobs(),
  },
  // 15.11 (owner, row 20): modules/spot-fallback/lambda/tuning_schema.json.
  spot: {
    gap_min: {
      ru: 'Запасной путь: ошибка Spot считается свежей столько минут',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    max_hold_min: {
      ru: 'Самая долгая пауза на обычных серверах, минут',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    restore_after_min: {
      ru: 'Назад на Spot: сколько минут без ошибок Spot (удваивается при повторе)',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    strike_window_min: {
      ru: 'Повтор: ошибка в течение стольких минут после возврата удваивает паузу',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
  },
  db: {
    down_conn_max_pct: {
      ru: 'Уменьшение: соединений весь срок ниже, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    down_cooldown_h: {
      ru: 'Уменьшение: не раньше чем через столько часов после изменения',
      min: 0,
      max: 1000000000,
      kind: 'number',
    },
    down_cpu_max_pct: {
      ru: 'Уменьшение: процессор весь этот срок ниже, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    down_mem_free_min_pct: {
      ru: 'Уменьшение: свободной памяти весь срок не меньше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    down_window_h: {
      ru: 'Уменьшение: сколько часов нагрузка должна быть низкой',
      min: 0,
      max: 1000000000,
      kind: 'number',
    },
    night_end_h: {
      ru: 'Окно уменьшения: до какого часа (по Чикаго, не включая)',
      min: 0,
      max: 24,
      kind: 'integer',
    },
    night_start_h: {
      ru: 'Окно уменьшения: с какого часа (по Чикаго)',
      min: 0,
      max: 23,
      kind: 'integer',
    },
    single_node_up: {
      ru: 'Одиночный узел (без копии) тоже растёт: 1 — да, 0 — нет',
      min: 0,
      max: 1,
      kind: 'flag',
    },
    single_up_points: {
      ru: 'Одиночный узел: сколько 5-минутных точек подряд нужна перегрузка',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    target_conn_max_pct: {
      ru: 'Меньший размер: соединений на нём будет не выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    target_cpu_max_pct: {
      ru: 'Меньший размер: процессор на нём будет не выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    target_mem_used_max_pct: {
      ru: 'Меньший размер: память на нём будет занята не выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_conn_fast_pct: {
      ru: 'Рост сразу: одна точка соединений выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_conn_pct: {
      ru: 'Рост: соединений выше, % от предела',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_conn_points: {
      ru: 'Рост: сколько точек подряд много соединений',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    up_cooldown_min: {
      ru: 'Рост: пауза после любого изменения, минут (0 — без паузы)',
      min: 0,
      max: 1000000000,
      kind: 'integer',
    },
    up_cpu_fast_pct: {
      ru: 'Рост быстро: процессор выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_cpu_fast_points: {
      ru: 'Рост быстро: сколько точек подряд',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    up_cpu_pct: {
      ru: 'Рост: процессор выше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_cpu_points: {
      ru: 'Рост: сколько 5-минутных точек подряд держится нагрузка',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
    up_mem_free_pct: {
      ru: 'Рост: свободной памяти меньше, %',
      min: 1,
      max: 100,
      kind: 'number',
    },
    up_mem_points: {
      ru: 'Рост: сколько точек подряд мало памяти',
      min: 1,
      max: 1000000000,
      kind: 'integer',
    },
  },
};

export type TuningCheck =
  | { ok: true; values: Record<string, number> }
  | { ok: false; errors: string[] };

/** The admin's input: numbers inside the bounds; `null` drops a key (back
 * to the Terraform default); anything else is an error naming the key. */
export function validateAutoscaleTuning(
  target: AutoscaleTarget,
  input: Record<string, unknown>,
): TuningCheck {
  const schema = AUTOSCALE_TUNING_SCHEMA[target];
  const values: Record<string, number> = {};
  const errors: string[] = [];
  for (const [k, v] of Object.entries(input)) {
    const s = schema[k];
    if (!s) {
      errors.push(`${k}: unknown`);
      continue;
    }
    if (v === null) continue;
    if (s.kind === 'flag') {
      if (v !== 0 && v !== 1) errors.push(`${k}: 0 or 1`);
      else values[k] = v;
      continue;
    }
    if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < s.min ||
      v > s.max
    ) {
      errors.push(`${k}: ${s.min}–${s.max}`);
      continue;
    }
    if (s.kind === 'integer' && !Number.isInteger(v)) {
      errors.push(`${k}: whole number`);
      continue;
    }
    values[k] = v;
  }
  return errors.length ? { ok: false, errors } : { ok: true, values };
}

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
export type AutoscaleTarget = 'db' | 'redis';

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

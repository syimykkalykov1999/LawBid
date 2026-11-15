/** Owner 14.11: the «Авто» numbers form (pure, tested in autoscale-tuning.test.ts). */
export interface TuningKnob {
  key: string;
  ru: string;
  min: number;
  max: number;
  kind: 'number' | 'integer' | 'flag';
  value: number | null;
}
export interface TuningTarget {
  target: 'db' | 'redis' | 'endpoints' | 'ecs';
  available: boolean;
  knobs: TuningKnob[];
}

/** What to send: changed fields only; an emptied field = null (back to the
 * default). Errors name the field in Russian; nothing is sent with errors. */
export function tuningChanges(t: TuningTarget, drafts: Record<string, string>): { values: Record<string, number | null>; errors: string[] } {
  const values: Record<string, number | null> = {};
  const errors: string[] = [];
  for (const k of t.knobs) {
    if (!(k.key in drafts)) continue;
    const raw = drafts[k.key].trim().replace(',', '.');
    if (raw === '') {
      if (k.value !== null) values[k.key] = null;
      continue;
    }
    const n = Number(raw);
    const bad =
      !Number.isFinite(n) || n < k.min || n > k.max || ((k.kind === 'integer' || k.kind === 'flag') && !Number.isInteger(n));
    if (bad) {
      errors.push(`${k.ru}: от ${k.min} до ${k.max}${k.kind === 'number' ? '' : ', целое'}`);
      continue;
    }
    if (n !== k.value) values[k.key] = n;
  }
  return { values, errors };
}

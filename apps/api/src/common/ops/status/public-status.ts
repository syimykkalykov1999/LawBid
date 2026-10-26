import type { ProbeResult } from './status-probes.service';

/**
 * Owner 2026-10-25: the public status page (status.lawbid.dev). Pure part:
 * turns the internal probes and incidents into the five things a user
 * understands. Nothing internal (hosts, numbers, error texts) ever leaves
 * here: only a state per component and the words an admin typed.
 */
export const PUBLIC_COMPONENTS = [
  'app',
  'chats',
  'calls',
  'payments',
  'notifications',
] as const;
export type PublicComponent = (typeof PUBLIC_COMPONENTS)[number];
export type PublicState = 'operational' | 'degraded' | 'outage';

export interface Bilingual {
  ru: string;
  en: string;
}

export const COMPONENT_NAMES: Record<PublicComponent, Bilingual> = {
  app: { ru: 'Приложение', en: 'App' },
  chats: { ru: 'Чаты', en: 'Chats' },
  calls: { ru: 'Звонки', en: 'Calls' },
  payments: { ru: 'Платежи', en: 'Payments' },
  notifications: { ru: 'Уведомления', en: 'Notifications' },
};

/** Which internal probes decide which public component. */
export const PROBE_TO_COMPONENT: Record<string, PublicComponent> = {
  http: 'app',
  database: 'app',
  worker: 'app',
  redis: 'chats',
  realtime: 'chats',
  cloudflare_turn: 'calls',
  cloudflare_sfu: 'calls',
  stripe_webhooks: 'payments',
  push: 'notifications',
  queues: 'notifications',
};

export interface PublicIncident {
  id: string;
  component: PublicComponent;
  kind: 'degraded' | 'outage' | 'maintenance';
  title: Bilingual;
  message: Bilingual;
  startedAt: string;
  resolvedAt: string | null;
  /** true: found by the monitoring, false: written by an admin. */
  auto: boolean;
}

export interface PublicStatus {
  updatedAt: string;
  overall: PublicState;
  components: { key: PublicComponent; name: Bilingual; state: PublicState }[];
  incidents: PublicIncident[];
}

export interface IncidentInput {
  id: string;
  component: string;
  severity: string;
  title: string;
  detail: Record<string, unknown>;
  openedAt: Date;
  closedAt: Date | null;
}

const RANK: Record<PublicState, number> = {
  operational: 0,
  degraded: 1,
  outage: 2,
};
const worse = (a: PublicState, b: PublicState): PublicState =>
  RANK[a] >= RANK[b] ? a : b;

export function isManual(i: { detail: Record<string, unknown> }): boolean {
  return i.detail?.manual === true;
}

function bilingual(v: unknown, fallback: string): Bilingual {
  const o = (v ?? {}) as Partial<Bilingual>;
  const ru = typeof o.ru === 'string' && o.ru ? o.ru : fallback;
  const en = typeof o.en === 'string' && o.en ? o.en : ru;
  return { ru, en };
}

export function buildPublicStatus(
  probes: ProbeResult[],
  incidents: IncidentInput[],
  now: Date,
): PublicStatus {
  const state = new Map<PublicComponent, PublicState>(
    PUBLIC_COMPONENTS.map((c) => [c, 'operational']),
  );
  const openAuto = new Set(
    incidents
      .filter((i) => !i.closedAt && !isManual(i))
      .map((i) => i.component),
  );
  for (const p of probes) {
    const comp = PROBE_TO_COMPONENT[p.key];
    if (!comp) continue;
    // A single red check is noise: «outage» only once the watchdog has
    // opened an incident (two bad checks in a row).
    const s: PublicState =
      p.status === 'red'
        ? openAuto.has(p.key)
          ? 'outage'
          : 'degraded'
        : p.status === 'yellow'
          ? 'degraded'
          : 'operational';
    state.set(comp, worse(state.get(comp)!, s));
  }

  const out: PublicIncident[] = [];
  for (const i of incidents) {
    if (isManual(i)) {
      const comp = i.component as PublicComponent;
      if (!PUBLIC_COMPONENTS.includes(comp)) continue;
      const kind =
        i.severity === 'outage'
          ? 'outage'
          : i.severity === 'maint'
            ? 'maintenance'
            : 'degraded';
      if (!i.closedAt && kind !== 'maintenance') {
        state.set(comp, worse(state.get(comp)!, kind));
      }
      out.push({
        id: i.id,
        component: comp,
        kind,
        title: bilingual(i.detail.title, i.title),
        message: bilingual(i.detail.message, ''),
        startedAt: i.openedAt.toISOString(),
        resolvedAt: i.closedAt?.toISOString() ?? null,
        auto: false,
      });
      continue;
    }
    const comp = PROBE_TO_COMPONENT[i.component];
    if (!comp) continue;
    const n = COMPONENT_NAMES[comp];
    out.push({
      id: i.id,
      component: comp,
      kind: 'outage',
      title: { ru: `Сбой: ${n.ru}`, en: `Problem: ${n.en}` },
      message: {
        ru: 'Мы увидели проблему и уже занимаемся ей.',
        en: 'We detected a problem and are working on it.',
      },
      startedAt: i.openedAt.toISOString(),
      resolvedAt: i.closedAt?.toISOString() ?? null,
      auto: true,
    });
  }
  out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const components = PUBLIC_COMPONENTS.map((key) => ({
    key,
    name: COMPONENT_NAMES[key],
    state: state.get(key)!,
  }));
  return {
    updatedAt: now.toISOString(),
    overall: components.reduce<PublicState>(
      (a, c) => worse(a, c.state),
      'operational',
    ),
    components,
    incidents: out.slice(0, 30),
  };
}

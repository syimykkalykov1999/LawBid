import type { components } from '@/lib/api/schema';
import type { CostRowStatus, CostState } from '@/lib/launch';

/**
 * Owner 2026-10-26 (calls failover): Integrations → ONE card «Связь для
 * звонков». Two rows (Cloudflare / our own relays) with the quiet status dot
 * of the registry, one 3-state control for `calls.transport`, a plain line
 * saying who carries calls now, and the «Проверить» button.
 */
export type CallsPath = components['schemas']['CallsPathDto'];
export type CallsPathSide = components['schemas']['CallsPathSideDto'];
export type CallsPathCheck = components['schemas']['CallsPathCheckDto'];
export type CallsTransport = CallsPath['transport'];

/** The services the card merges (their key cards live inside it). */
export const CALL_PROVIDERS = ['cloudflare_turn', 'cloudflare_sfu', 'turn', 'livekit'] as const;

export function isCallProvider(id: string): boolean {
  return (CALL_PROVIDERS as readonly string[]).includes(id);
}

/**
 * Выкл / Вкл / Авто ↔ `calls.transport`. There is no switch that turns calls
 * off as a whole (grep 2026-10-26: only per-plan rights and `video_calls`),
 * so Выкл means «Cloudflare off: every call on our own path» (`own`).
 */
export const TRANSPORT_OF_STATE: Record<CostState, CallsTransport> = {
  off: 'own',
  on: 'cloudflare',
  auto: 'auto',
};

export function stateOfTransport(t: string | null | undefined): CostState {
  if (t === 'own') return 'off';
  if (t === 'cloudflare') return 'on';
  return 'auto';
}

export const TRANSPORT_HINT: Record<CostState, string> = {
  off: 'Cloudflare не используется: все звонки идут через свою связь (coturn и LiveKit или напрямую между телефонами).',
  on: 'Только Cloudflare, без автоматического перехода на свою связь (нужны ключи Cloudflare).',
  auto: 'Cloudflare основной; если он сбоит, звонки сами переходят на свою связь и сами возвращаются. По умолчанию.',
};

export function carryingLine(r: Pick<CallsPath, 'carrying'>): string {
  return `Сейчас звонки идут через: ${r.carrying === 'cloudflare' ? 'Cloudflare' : 'свою связь'}`;
}

const status = (
  r: CallsPath,
  live: CostRowStatus['live'],
  reason: string,
  checkedAt: string | null,
): CostRowStatus => ({
  state: stateOfTransport(r.transport),
  live,
  reason,
  checkedAt: checkedAt ?? '',
});

/** Cloudflare row: green carries calls now, grey standby / no keys, amber
 * the last probe failed or its breaker is open. */
export function cloudflareStatus(r: CallsPath): CostRowStatus {
  const side = r.cloudflare;
  const at = side.lastProbeAt;
  if (!side.configured) return status(r, 'idle', 'ключи Cloudflare не добавлены', at);
  if (r.transport === 'own') return status(r, 'idle', 'выключено: звонки идут через свою связь', at);
  const open =
    (side.parts.turn && r.breakers.turn === 'open') || (side.parts.sfu && r.breakers.sfu === 'open');
  if (side.lastProbeOk === false || open) {
    return status(
      r,
      'attention',
      r.carrying === 'own'
        ? 'Cloudflare сбоит: звонки идут через свою связь, Cloudflare проверяется раз в минуту и вернётся сам'
        : 'последняя проверка Cloudflare не прошла',
      at,
    );
  }
  if (r.carrying === 'cloudflare') return status(r, 'active', 'несёт звонки сейчас', at);
  return status(r, 'idle', 'в запасе', at);
}

/** Own row (coturn + LiveKit): green carries calls now, grey standby or not
 * set up, amber its last check failed. */
export function ownStatus(r: CallsPath): CostRowStatus {
  const side = r.own;
  const at = side.lastProbeAt;
  if (!side.configured) {
    return status(r, 'idle', 'не настроена: запасной путь — напрямую между телефонами', at);
  }
  if (side.lastProbeOk === false) return status(r, 'attention', 'последняя проверка своей связи не прошла', at);
  if (r.carrying === 'own') return status(r, 'active', 'несёт звонки сейчас', at);
  return status(r, 'idle', 'в запасе: включится сама, если Cloudflare сбоит', at);
}

/** «✓ 120 мс» / «✗ причина» / null when never checked. */
export function checkLine(c: CallsPathCheck | null | undefined): string | null {
  if (!c) return null;
  if (c.ok) return `✓ ${c.ms} мс`;
  const why = c.error ?? c.turn?.error ?? c.stun?.error ?? c.media?.error ?? 'не отвечает';
  return `✗ ${why}`;
}

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
  off: 'Cloudflare не используется: все звонки идут через свою связь (свой TURN-сервер coturn и напрямую между телефонами).',
  on: 'Только Cloudflare: свой TURN и напрямую между телефонами не используются, своя машина не запускается. Нет Cloudflare — звонок не состоится (нужны ключи Cloudflare).',
  auto: 'Пока Cloudflare исправен, все звонки идут только через него. Если он сбоит, звонки сами переходят на свою связь и сами возвращаются. По умолчанию.',
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

/** Own row (coturn + device to device; TS-3: LiveKit is not part of the
 * automatic backup — no app client for it): green carries calls now, grey standby or not
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

/**
 * R-402 (owner 2026-11-04, «Соединение…» for minutes): is there a TURN relay
 * on offer for NEW calls at all? Without one the phones get STUN only and
 * behind mobile (symmetric) NAT the call never connects or stays weak.
 * Cloudflare counts only with its TURN keys switched on («Включить» in the
 * key card; saved-but-off keys are invisible to the server) and the switch
 * not on «Выкл»; our own side counts with a coturn address (fixed or the
 * on-demand box while it runs).
 */
export function relayWarning(r: CallsPath): string | null {
  if (r.transport === 'cloudflare') {
    if (!r.cloudflare.parts.turn) {
      return 'Звонки не состоятся: выбран «Вкл» (только Cloudflare), а ключи Cloudflare TURN не включены (в карточке ключа нажмите «Включить»).';
    }
    if (r.cloudflare.lastProbeOk === false || r.breakers.turn === 'open') {
      return 'Звонки могут не состояться: выбран «Вкл» (только Cloudflare), а его ретранслятор не отвечает. Своя связь при «Вкл» не используется; переключите на «Авто», если нужно.';
    }
    return null;
  }
  const cf = r.cloudflare.parts.turn && r.transport !== 'own';
  const own = r.own.parts.turn;
  if (own) return null;
  if (!cf) {
    return r.cloudflare.parts.turn
      ? 'Нет ретранслятора (TURN): Cloudflare выключен («Выкл»), а свой TURN-сервер не настроен или остановлен. Звонки идут только напрямую — через мобильный интернет соединение может не установиться. Переключите на «Авто» или включите свой TURN.'
      : 'Нет ретранслятора (TURN): ключи Cloudflare TURN не включены (в карточке ключа нажмите «Включить»), а свой TURN-сервер не настроен или остановлен. Звонки идут только напрямую — через мобильный интернет соединение может не установиться.';
  }
  if (r.cloudflare.lastProbeOk === false || r.breakers.turn === 'open') {
    return 'Ретранслятор Cloudflare TURN не отвечает, а своего TURN-сервера нет: звонки идут только напрямую, пока Cloudflare не вернётся.';
  }
  return null;
}

/** «✓ 120 мс» / «✗ причина» / null when never checked. */
export function checkLine(c: CallsPathCheck | null | undefined): string | null {
  if (!c) return null;
  if (c.ok) return `✓ ${c.ms} мс`;
  const why = c.error ?? c.turn?.error ?? c.stun?.error ?? c.media?.error ?? 'не отвечает';
  return `✗ ${why}`;
}

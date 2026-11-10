/**
 * 08.11.2026 (e-mail): what the last SES sends said, for the «Здоровье»
 * card. SES in its sandbox (account without production access) refuses
 * every recipient that is not a verified identity with `MessageRejected`
 * «Email address is not verified», so on prod every user and alert e-mail
 * failed while the board said nothing specific. The provider reports each
 * outcome here; StatusProbesService plugs in a Redis sink so every API and
 * worker task feeds one fleet-wide reading (probe `email`).
 */
export type SesProblem = 'sandbox' | 'no_permission' | 'error';

/** Pure: why SES refused [error]. */
export function classifySesError(error: unknown): SesProblem {
  const e = error as { name?: unknown; Code?: unknown; message?: unknown };
  const name = typeof e?.name === 'string' ? e.name : '';
  const code = typeof e?.Code === 'string' ? e.Code : '';
  const text = typeof e?.message === 'string' ? e.message : '';
  if (
    (name === 'MessageRejected' || code === 'MessageRejected') &&
    /not verified/i.test(text)
  ) {
    return 'sandbox';
  }
  if (/AccessDenied/i.test(name) || /AccessDenied/i.test(code)) {
    return 'no_permission';
  }
  return 'error';
}

export interface SesDeliverySink {
  ok(atMs: number): void;
  problem(kind: SesProblem, atMs: number, message: string): void;
}

let sink: SesDeliverySink | null = null;
let lastOkWrittenMs = 0;
/** An ok is written at most this often per process (every login code would
 * otherwise be a Redis write). Problems are always written: they are rare. */
const OK_EVERY_MS = 60_000;

export function setSesDeliverySink(s: SesDeliverySink | null): void {
  sink = s;
  lastOkWrittenMs = 0;
}

export function recordSesOk(nowMs: number = Date.now()): void {
  if (!sink || nowMs - lastOkWrittenMs < OK_EVERY_MS) return;
  lastOkWrittenMs = nowMs;
  try {
    sink.ok(nowMs);
  } catch {
    // the reading is advisory; a send never fails because of it
  }
}

export function recordSesProblem(
  error: unknown,
  nowMs: number = Date.now(),
): void {
  if (!sink) return;
  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message.slice(0, 200)
      : '';
  try {
    sink.problem(classifySesError(error), nowMs, message);
  } catch {
    // advisory only
  }
}

/** Pure: the board's reading from the two stamps. */
export function sesDeliveryStatus(
  lastOkMs: number | null,
  lastProblem: { kind: SesProblem; atMs: number; message?: string } | null,
): {
  status: 'green' | 'yellow' | 'red' | 'grey';
  detail: Record<string, unknown>;
} {
  if (!lastProblem && lastOkMs === null) {
    return { status: 'grey', detail: { sent: false } };
  }
  if (!lastProblem || (lastOkMs !== null && lastOkMs > lastProblem.atMs)) {
    return {
      status: 'green',
      detail: { lastOkAt: new Date(lastOkMs!).toISOString() },
    };
  }
  const base = {
    problem: lastProblem.kind,
    at: new Date(lastProblem.atMs).toISOString(),
    lastOkAt: lastOkMs === null ? null : new Date(lastOkMs).toISOString(),
    message: lastProblem.message ?? '',
  };
  if (lastProblem.kind === 'sandbox') {
    return {
      status: 'red',
      detail: { ...base, text: 'SES: песочница — письма не уходят' },
    };
  }
  if (lastProblem.kind === 'no_permission') {
    return {
      status: 'red',
      detail: { ...base, text: 'SES: у сервера нет права отправлять письма' },
    };
  }
  return { status: 'yellow', detail: { ...base, text: 'SES: письмо не ушло' } };
}

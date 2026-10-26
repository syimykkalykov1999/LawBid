'use client';

import createClient, { type Middleware } from 'openapi-fetch';
import { isBackgroundNow } from '../activity';
import { countryTab } from '../country-tab';
import type { paths } from './schema';

/**
 * Typed client over the generated OpenAPI types (npm run generate). Calls
 * go to /api/proxy, which adds the admin JWT server-side; the paths keep
 * their `/admin/...` names so the types line up with the contract.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function throwApiError(response: Response): Promise<never> {
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as {
    error?: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  } | null;
  throw new ApiError(
    response.status,
    body?.error?.code ?? 'INTERNAL_ERROR',
    body?.error?.message ?? `HTTP ${response.status}`,
    body?.error?.details,
  );
}

/**
 * Re-targets a request to another path. Rebuilt with a materialized body:
 * `new Request(url, request)` would carry a streaming body, which Chrome
 * only sends over HTTP/2 (ERR_ALPN_NEGOTIATION_FAILED on plain HTTP/1.1).
 */
async function reroute(
  request: Request,
  map: (pathname: string) => string,
): Promise<Request> {
  const url = new URL(request.url);
  url.pathname = map(url.pathname);
  const headers = new Headers(request.headers);
  const country = countryTab();
  if (country) headers.set('x-admin-country', country);
  // S18-1: reads made while nobody touches the screen must not keep the
  // 30-minute idle session alive.
  if (request.method === 'GET' && isBackgroundNow()) headers.set('x-background', '1');
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const body = hasBody ? await request.text() : undefined;
  const out = new Request(url, {
    method: request.method,
    headers,
    body,
    credentials: 'same-origin',
  });
  sentBodies.set(out, body);
  return out;
}

/** The materialized body of each proxied request, for a step-up retry. */
const sentBodies = new WeakMap<Request, string | undefined>();

/**
 * Owner 2026-10-22 (system audit #2, item 2): money and identity actions
 * answer 403 ADMIN_STEP_UP_REQUIRED until the admin types a fresh code.
 * The app shell registers a prompt (StepUpHost); the client asks once,
 * then repeats the same request — no page needs its own dialog. A
 * cancelled prompt ends as ADMIN_STEP_UP_CANCELLED.
 */
type StepUpPrompt = () => Promise<boolean>;
let stepUpPrompt: StepUpPrompt | null = null;
let stepUpInFlight: Promise<boolean> | null = null;
export function registerStepUpPrompt(prompt: StepUpPrompt | null): void {
  stepUpPrompt = prompt;
}

async function stepUpAndRetry(request: Request, response: Response): Promise<Response | null> {
  if (response.status !== 403 || !stepUpPrompt) return null;
  if (new URL(request.url).pathname.endsWith('/auth/step-up')) return null;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: { code?: string } } | null;
  if (body?.error?.code !== 'ADMIN_STEP_UP_REQUIRED') return null;
  stepUpInFlight ??= stepUpPrompt().finally(() => {
    stepUpInFlight = null;
  });
  if (!(await stepUpInFlight)) {
    throw new ApiError(403, 'ADMIN_STEP_UP_CANCELLED', 'Step-up cancelled.');
  }
  return fetch(
    new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: sentBodies.get(request),
      credentials: 'same-origin',
    }),
  );
}

export const toProxy: Middleware = {
  // `/admin/x` → `/api/proxy/x`
  onRequest: ({ request }) =>
    reroute(request, (p) => p.replace(/^\/admin\//, '/api/proxy/')),
  async onResponse({ request, response: first }) {
    let response = first;
    if (response.ok) return response;
    const retried = await stepUpAndRetry(request, response);
    if (retried) {
      if (retried.ok) return retried;
      response = retried;
    }
    if (response.status === 401 && typeof window !== 'undefined') {
      const next = encodeURIComponent(window.location.pathname);
      window.location.assign(`/login?next=${next}`);
    }
    return throwApiError(response);
  },
};

export const api = createClient<paths>({ baseUrl: '/' });
api.use(toProxy);

/** The unauthenticated sign-in steps go through app/api/public. */
export const publicApi = createClient<paths>({ baseUrl: '/' });
publicApi.use({
  onRequest: ({ request }) =>
    reroute(request, (p) => p.replace(/^\/admin\/auth\//, '/api/public/auth/')),
  async onResponse({ response }) {
    if (response.ok) return response;
    return throwApiError(response);
  },
});

const ERROR_TEXT: Record<string, string> = {
  AUTH_OTP_INVALID: 'Неверный код.',
  AUTH_OTP_EXPIRED: 'Код истёк — запросите новый.',
  AUTH_OTP_LOCKED: 'Слишком много попыток. Подождите и запросите новый код.',
  AUTH_OTP_REQUEST_LIMIT: 'Слишком много запросов. Попробуйте позже.',
  ADMIN_TICKET_INVALID: 'Сессия входа истекла — начните заново.',
  ADMIN_TOTP_INVALID: 'Неверный код аутентификатора.',
  ADMIN_RECOVERY_CODE_INVALID: 'Неверный или уже использованный recovery-код.',
  ADMIN_AUTH_NOT_CONFIGURED: 'Вход администратора не настроен на сервере.',
  ADMIN_EMAIL_TAKEN: 'Аккаунт с таким email уже существует.',
  ADMIN_CREDENTIALS_INVALID: 'Неверный логин или пароль.',
  ADMIN_LOGIN_TAKEN: 'Этот логин уже занят другим админом.',
  ADMIN_RECOVERY_FAILED: 'Ответ неверный.',
  ADMIN_STEP_UP_REQUIRED: 'Подтвердите действие кодом из аутентификатора.',
  ADMIN_STEP_UP_CANCELLED: 'Действие отменено: код подтверждения не введён.',
  ADMIN_TOTP_SETUP_REQUIRED: 'Подключите приложение-аутентификатор: войдите заново.',
  // Owner 2026-10-22: passkeys (Face ID / Touch ID / Windows Hello / hardware key).
  PASSKEY_INVALID: 'Ключ доступа не подошёл. Попробуйте ещё раз или введите код из приложения.',
  PASSKEY_NOT_FOUND: 'Ключ доступа не добавлен — используйте код.',
  PASSKEY_LIMIT: 'Ключей доступа уже максимум. Удалите ненужный, чтобы добавить новый.',
  FORBIDDEN: 'Недостаточно прав.',
  VERIFICATION_DECISION_INCOMPLETE: 'Сначала решите по каждой лицензии (кнопка «Подтвердить» или «Отклонить» в строке лицензии) — хотя бы одна должна быть подтверждена.',
  PAYMENTS_NOT_CONFIGURED: 'Stripe не отвечает или ключ не подходит: проверьте ключ Stripe в Система → Ключи и сервисы. Остальное сохранено.',
  REASON_REQUIRED: 'Напишите причину: в этом разделе она обязательна.',
  JUSTIFICATION_REQUIRED: 'Укажите причину просмотра (не короче 10 символов).',
  VALIDATION_ERROR: 'Проверьте введённые данные.',
  PLAN_CODE_EXISTS: 'План с таким кодом уже есть.',
  PLAN_IN_USE: 'У плана есть подписчики — его можно только архивировать.',
  RATE_LIMITED: 'Слишком много запросов. Попробуйте позже.',
  // Owner 2026-10-05 (legal): outreach compliance (TCPA / Do-Not-Call).
  OUTREACH_CONTACT_BLOCKED: 'Связь с этим контактом сейчас запрещена (часы звонков, «не беспокоить» или выключенные клиенты-физлица).',
  OUTREACH_CLIENTS_DISABLED: 'Работа с клиентами-физлицами выключена в настройках Привлечения',
  DMCA_INVALID_STATE: 'Действие недоступно для этого уведомления DMCA в его текущем статусе',
  LEGAL_REACCEPT_REQUIRED: 'Нужно принять обновлённые юридические документы.',
  UNAUTHORIZED: 'Сессия завершена. Войдите снова.',
  DEMO_DISABLED: 'Демо-режим выключен или у партнёра нет демо-доступа.',
  DEMO_LIMIT_REACHED: 'У партнёра уже максимум демо-аккаунтов.',
  DEMO_UNAVAILABLE: 'Демо-база не готова. Причина — на вкладке «Демо-доступ».',
  DEMO_CODE_INVALID: 'Код не найден, истёк или удалён.',
};

const SERVER_DOWN = 'Сервер не ответил, попробуйте ещё раз.';

/** Raw server code/message behind a friendly text, for tooltips (see ErrorNote). */
const DETAILS = new Map<string, string>();
export function errorDetail(text: string | null | undefined): string | undefined {
  return text ? DETAILS.get(text) : undefined;
}

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const known = ERROR_TEXT[e.code];
    const generic = !known && (e.status >= 500 || e.code === 'INTERNAL_ERROR');
    // A rejected field names itself: the server message says which field
    // and why («Webhook signing secret is required.»), so show it after the
    // generic line instead of hiding it.
    const field = e.code === 'VALIDATION_ERROR' && e.details?.field;
    const base = field
      ? `${known} ${e.message}`
      : (known ?? (generic ? SERVER_DOWN : e.message));
    const left = e.details?.remainingAttempts;
    const text = typeof left === 'number' ? `${base} Осталось попыток: ${left}.` : base;
    if (generic) DETAILS.set(text, `${e.status} ${e.code}: ${e.message}`);
    return text;
  }
  if (e instanceof TypeError) {
    DETAILS.set(SERVER_DOWN, e.message);
    return SERVER_DOWN;
  }
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

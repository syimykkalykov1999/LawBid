'use client';

import createClient, { type Middleware } from 'openapi-fetch';
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
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  return new Request(url, {
    method: request.method,
    headers: request.headers,
    body: hasBody ? await request.text() : undefined,
    credentials: 'same-origin',
  });
}

const toProxy: Middleware = {
  // `/admin/x` → `/api/proxy/x`
  onRequest: ({ request }) =>
    reroute(request, (p) => p.replace(/^\/admin\//, '/api/proxy/')),
  async onResponse({ response }) {
    if (response.ok) return response;
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

export const ERROR_TEXT: Record<string, string> = {
  AUTH_OTP_INVALID: 'Неверный код.',
  AUTH_OTP_EXPIRED: 'Код истёк — запросите новый.',
  AUTH_OTP_LOCKED: 'Слишком много попыток. Подождите и запросите новый код.',
  AUTH_OTP_REQUEST_LIMIT: 'Слишком много запросов. Попробуйте позже.',
  ADMIN_TICKET_INVALID: 'Сессия входа истекла — начните заново.',
  ADMIN_TOTP_INVALID: 'Неверный код аутентификатора.',
  ADMIN_RECOVERY_CODE_INVALID: 'Неверный или уже использованный recovery-код.',
  ADMIN_AUTH_NOT_CONFIGURED: 'Вход администратора не настроен на сервере.',
  ADMIN_EMAIL_TAKEN: 'Аккаунт с таким email уже существует.',
  FORBIDDEN: 'Недостаточно прав.',
  JUSTIFICATION_REQUIRED: 'Укажите причину просмотра (не короче 10 символов).',
  VALIDATION_ERROR: 'Проверьте введённые данные.',
  RATE_LIMITED: 'Слишком много запросов. Попробуйте позже.',
  UNAUTHORIZED: 'Сессия завершена. Войдите снова.',
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
    const base = known ?? (generic ? SERVER_DOWN : e.message);
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

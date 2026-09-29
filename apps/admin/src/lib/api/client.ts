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

const toProxy: Middleware = {
  onRequest({ request }) {
    const url = new URL(request.url);
    // `/admin/x` → `/api/proxy/x`
    url.pathname = url.pathname.replace(/^\/admin\//, '/api/proxy/');
    return new Request(url, request);
  },
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
  onRequest({ request }) {
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(
      /^\/admin\/auth\//,
      '/api/public/auth/',
    );
    return new Request(url, request);
  },
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

export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const base = ERROR_TEXT[e.code] ?? e.message;
    const left = e.details?.remainingAttempts;
    return typeof left === 'number'
      ? `${base} Осталось попыток: ${left}.`
      : base;
  }
  return 'Что-то пошло не так. Попробуйте ещё раз.';
}

import type { BrowserOptions, ErrorEvent } from '@sentry/browser';

const PII_KEYS =
  /phone|email|identifier|value|code|token|password|authorization|cookie|name|message|body|text|content/i;

/**
 * Owner 2026-10-20: before anything leaves the browser the event loses
 * request data, the user and every PII-named field; the URL loses its query
 * and an e-mail or phone left in an error message is masked. Mirrors the
 * server's scrubSentryEvent (apps/api/src/app.setup.ts).
 */
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    delete event.request.query_string;
    if (event.request.url) {
      event.request.url = event.request.url.replace(/[?#].*$/, '');
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = maskText(ex.value);
  }
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    const rec = o as Record<string, unknown>;
    for (const k of Object.keys(rec)) {
      if (PII_KEYS.test(k)) rec[k] = '[REDACTED]';
      else walk(rec[k]);
    }
  };
  walk(event.extra);
  walk(event.contexts);
  event.breadcrumbs = (event.breadcrumbs ?? [])
    .filter((b) => b.category !== 'ui.input')
    .map((b) => ({ ...b, message: undefined, data: undefined }));
  return event;
}

export function maskText(s: string): string {
  return s
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[number]');
}

/**
 * Sentry 11 removed `sendDefaultPii`; an unset `dataCollection` now sends
 * cookies, request bodies, headers and the user. This is the v10
 * restrictive baseline, copied from the SDK's MIGRATION.md («If you want to
 * keep the v10 default behavior», getsentry/sentry-javascript, MIT); the
 * API keeps the same one (apps/api/src/telemetry/sentry.ts).
 */
const HEADER_DENY = ['forwarded', '-ip', 'remote-', 'via', '-user'];
const DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: HEADER_DENY },
    response: { deny: HEADER_DENY },
  },
  httpBodies: [],
  urlQueryParams: { deny: HEADER_DENY },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies BrowserOptions['dataCollection'];

/** Options for the admin panel's browser client (components/sentry-init.tsx). */
export function sentryInitOptions(dsn: string): BrowserOptions {
  return {
    dsn,
    environment: 'production',
    dataCollection: DATA_COLLECTION,
    tracesSampleRate: 0,
    // v11 turned this on by default; v10 sent non-Error values without a
    // synthetic stack (issue grouping and errored-session counts stay put).
    attachStacktrace: false,
    beforeSend: (event) => scrubEvent(event),
  };
}

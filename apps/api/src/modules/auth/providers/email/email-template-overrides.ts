import type { EmailMessage } from './email-provider.interface';
import {
  isEmailTemplateKey,
  normalizeEmailLocale,
  REQUIRED_TEMPLATE_VARS,
  renderEmailTemplate,
} from './email-template-render';

/** The columns of an `email_templates` row the sender needs. */
export interface EmailTemplateOverrideRow {
  subject: string;
  text_body: string;
  html_body: string | null;
  enabled: boolean;
}

export type EmailTemplateLoader = (
  key: string,
  locale: string,
) => Promise<EmailTemplateOverrideRow | null>;

const CACHE_TTL_MS = 60_000;
/** A slow database must never hold up a sign-in code. */
const LOOKUP_TIMEOUT_MS = 1_500;

const cache = new Map<
  string,
  { row: EmailTemplateOverrideRow | null; until: number }
>();

/** Drops cached overrides in this process (the admin editor calls it on
 * save; other processes pick the change up within 60 s). */
export function invalidateEmailTemplateCache(): void {
  cache.clear();
}

async function cachedRow(
  loader: EmailTemplateLoader,
  key: string,
  locale: string,
  now: number,
): Promise<EmailTemplateOverrideRow | null> {
  const id = `${key}|${locale}`;
  const hit = cache.get(id);
  if (hit && hit.until > now) return hit.row;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('email template lookup timed out')),
      LOOKUP_TIMEOUT_MS,
    );
  });
  try {
    const row = await Promise.race([loader(key, locale), timeout]);
    cache.set(id, { row, until: now + CACHE_TTL_MS });
    return row;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Returns the message to deliver: the admin override for
 * (template.key, locale || 'en') when one is enabled, else the built-in
 * message unchanged. Throws only through `loader`/render errors — the
 * caller catches and falls back to the built-in message.
 */
export async function applyEmailTemplateOverride(
  message: EmailMessage,
  loader: EmailTemplateLoader,
  now = Date.now(),
): Promise<EmailMessage> {
  const t = message.template;
  if (!t || !isEmailTemplateKey(t.key)) return message;
  const row = await cachedRow(
    loader,
    t.key,
    normalizeEmailLocale(t.locale),
    now,
  );
  if (!row || !row.enabled) return message;
  const rendered = renderEmailTemplate(
    { subject: row.subject, textBody: row.text_body, htmlBody: row.html_body },
    t.vars,
  );
  // Defence in depth (save-time validation is the main check): a code /
  // link the user needs must survive the override, or the built-in goes.
  for (const name of REQUIRED_TEMPLATE_VARS[t.key]) {
    const value = t.vars[name];
    if (value && !rendered.text.includes(value)) return message;
  }
  if (!rendered.subject || !rendered.text.trim()) return message;
  return { to: message.to, ...rendered };
}

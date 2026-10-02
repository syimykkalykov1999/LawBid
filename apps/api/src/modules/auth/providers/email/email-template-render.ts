/**
 * Owner 2026-10-02 — admin-editable transactional emails. Shared by the
 * email provider factory (applies an enabled `email_templates` override
 * before delivery) and the admin editor (preview / test / validation).
 * Pure functions only: no Nest, no Prisma.
 */

/** Keys of every built-in email that can be overridden. */
export const EMAIL_TEMPLATE_KEYS = [
  'login_otp',
  'admin_login_code',
  'contact_otp',
  'new_device',
  'data_export',
  'notification',
] as const;
export type EmailTemplateKey = (typeof EMAIL_TEMPLATE_KEYS)[number];

export const EMAIL_TEMPLATE_LOCALES = ['en', 'ru'] as const;
export type EmailTemplateLocale = (typeof EMAIL_TEMPLATE_LOCALES)[number];
export const DEFAULT_EMAIL_LOCALE: EmailTemplateLocale = 'en';

/**
 * Variables an override MUST contain (in the text body, and in the HTML
 * body when one is given). A sign-in / verification email without the
 * code would lock people out, so these are rejected at save time and
 * double-checked at send time.
 */
export const REQUIRED_TEMPLATE_VARS: Readonly<
  Record<EmailTemplateKey, readonly string[]>
> = {
  login_otp: ['code'],
  admin_login_code: ['code'],
  contact_otp: ['code'],
  new_device: [],
  data_export: ['url'],
  notification: [],
};

export function isEmailTemplateKey(v: string): v is EmailTemplateKey {
  return (EMAIL_TEMPLATE_KEYS as readonly string[]).includes(v);
}

export function normalizeEmailLocale(locale?: string): EmailTemplateLocale {
  const short = (locale ?? '').slice(0, 2).toLowerCase();
  return (EMAIL_TEMPLATE_LOCALES as readonly string[]).includes(short)
    ? (short as EmailTemplateLocale)
    : DEFAULT_EMAIL_LOCALE;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const VAR_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;

/** Names of the `{{var}}` placeholders used in a template string. */
export function templateVariables(template: string): string[] {
  const out = new Set<string>();
  for (const m of template.matchAll(VAR_RE)) out.add(m[1]);
  return [...out];
}

/** Replaces `{{var}}` (unknown → empty); `escape` HTML-escapes values. */
export function renderTemplateString(
  template: string,
  vars: Readonly<Record<string, string>>,
  escape = false,
): string {
  return template.replace(VAR_RE, (_m, name: string) => {
    const v = Object.prototype.hasOwnProperty.call(vars, name)
      ? (vars[name] ?? '')
      : '';
    return escape ? escapeHtml(v) : v;
  });
}

const URL_RE = /\b((?:https?|lawbid):\/\/[^\s<]+)/g;

/** Plain text → simple HTML paragraphs (escaped, links clickable). */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter((para) => para.length > 0)
    .map((para) => {
      const body = escapeHtml(para)
        .replace(URL_RE, '<a href="$1" style="color:#8A6D24">$1</a>')
        .replace(/\n/g, '<br>');
      return `<p style="margin:0 0 14px 0">${body}</p>`;
    })
    .join('');
}

/**
 * The branded LawBid layout: dark #0B0B0D header band with the gold
 * #C9A24A "LawBid" wordmark, a white card with the body, and a footer.
 * Inline styles only (mail clients drop <style>).
 */
export function wrapInBrandLayout(innerHtml: string): string {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1"></head>',
    '<body style="margin:0;padding:0;background:#F4F1EA">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:24px 12px">',
    '<tr><td align="center">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;border-collapse:collapse">',
    '<tr><td style="background:#0B0B0D;padding:20px 28px;border-radius:12px 12px 0 0">',
    '<span style="font-family:Georgia,\'Times New Roman\',serif;font-size:24px;font-weight:bold;letter-spacing:1px;color:#C9A24A">LawBid</span>',
    '</td></tr>',
    '<tr><td style="background:#FFFFFF;padding:28px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1C1B19">',
    innerHtml,
    '</td></tr>',
    '<tr><td style="background:#0B0B0D;padding:14px 28px;border-radius:0 0 12px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:#B8B2A3">',
    'LawBid · This is an automated message, please do not reply.',
    '</td></tr>',
    '</table></td></tr></table></body></html>',
  ].join('');
}

export interface TemplateSource {
  subject: string;
  textBody: string;
  htmlBody?: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Renders an override:
 * - subject / text: `{{var}}` replaced verbatim (subject kept one line);
 * - html body starting with `<`: raw HTML, values HTML-escaped;
 * - html body not starting with `<`: treated as text, rendered and
 *   wrapped in the branded layout;
 * - empty html body: the rendered text in the branded layout.
 */
export function renderEmailTemplate(
  src: TemplateSource,
  vars: Readonly<Record<string, string>>,
): RenderedEmail {
  const subject = renderTemplateString(src.subject, vars)
    .replace(/[\r\n]+/g, ' ')
    .trim();
  const text = renderTemplateString(src.textBody, vars);
  const htmlSrc = (src.htmlBody ?? '').trim();
  let html: string;
  if (htmlSrc.startsWith('<')) {
    html = renderTemplateString(htmlSrc, vars, true);
  } else if (htmlSrc.length > 0) {
    html = wrapInBrandLayout(textToHtml(renderTemplateString(htmlSrc, vars)));
  } else {
    html = wrapInBrandLayout(textToHtml(text));
  }
  return { subject, text, html };
}

/** Required placeholders missing from an override (empty = valid). */
export function missingRequiredVars(
  key: EmailTemplateKey,
  src: TemplateSource,
): string[] {
  const required = REQUIRED_TEMPLATE_VARS[key];
  const inText = new Set(templateVariables(src.textBody));
  const html = (src.htmlBody ?? '').trim();
  const inHtml = html ? new Set(templateVariables(html)) : null;
  return required.filter((v) => !inText.has(v) || (inHtml && !inHtml.has(v)));
}

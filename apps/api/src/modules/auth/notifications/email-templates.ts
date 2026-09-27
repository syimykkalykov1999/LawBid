import type { EmailMessage } from '../providers/email/email-provider.interface';

/** Custom-scheme deep links handled by the mobile app's router. */
export const APP_DEEP_LINK_SCHEME = 'lawbid://';
/** docs/01 §10.2 E/F: the email-code screen, pre-filled from the link. */
export const EMAIL_CODE_LINK_PATH = 'auth/email-code';
/** docs/01 §10.4 "Активные устройства" (mobile AppRoutes.activeDevices). */
export const ACTIVE_DEVICES_LINK_PATH = 'profile/settings/devices';

export interface AppLinks {
  /** `lawbid://...` — always present. */
  deepLink: string;
  /** `https://<APP_LINK_BASE_URL>/...` universal/app link — only when
   * APP_LINK_BASE_URL is configured. */
  universalLink?: string;
}

export function buildAppLinks(
  path: string,
  query: Record<string, string> | undefined,
  appLinkBaseUrl: string | undefined,
): AppLinks {
  const qs = query ? `?${new URLSearchParams(query).toString()}` : '';
  return {
    deepLink: `${APP_DEEP_LINK_SCHEME}${path}${qs}`,
    universalLink: appLinkBaseUrl
      ? `${appLinkBaseUrl.replace(/\/+$/, '')}/${path}${qs}`
      : undefined,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlLinks(links: AppLinks, label: string): string {
  // Most mail clients only make http(s) links clickable, so the universal
  // link is the primary button when configured; the custom scheme is
  // always offered too (it works from the device's own mail app).
  const primary = links.universalLink ?? links.deepLink;
  const secondary = links.universalLink
    ? `<p style="font-size:12px">Or open directly in the app: <a href="${escapeHtml(links.deepLink)}">${escapeHtml(links.deepLink)}</a></p>`
    : '';
  return `<p><a href="${escapeHtml(primary)}">${escapeHtml(label)}</a></p>${secondary}`;
}

function textLinks(links: AppLinks): string {
  return links.universalLink
    ? `${links.universalLink}\nOr in the app: ${links.deepLink}`
    : links.deepLink;
}

/**
 * docs/01 §10.2 E/F: "письмо с кодом и магической ссылкой (deep link)".
 * The code stays in the body (typed manually on any device). The magic
 * link — present only when the requesting app bound a device verifier —
 * carries a random one-time token, NEVER the code or the email: link
 * scanners, proxies and browser history must not see a credential, and
 * the token is useless without the verifier kept on the requesting phone
 * (security review 2026-09-27). Login OTPs only.
 */
export function buildLoginOtpEmail(input: {
  email: string;
  code: string;
  ttlMinutes: number;
  linkToken?: string;
  appLinkBaseUrl?: string;
}): EmailMessage {
  const links = input.linkToken
    ? buildAppLinks(
        EMAIL_CODE_LINK_PATH,
        { token: input.linkToken },
        input.appLinkBaseUrl,
      )
    : undefined;
  const text = [
    `Your LawBid sign-in code: ${input.code}`,
    `It expires in ${input.ttlMinutes} minutes.`,
    ...(links
      ? [
          '',
          'Or tap to sign in on the phone you requested it from:',
          textLinks(links),
        ]
      : []),
    '',
    "If you didn't request this code, you can ignore this email.",
  ].join('\n');
  const html = [
    `<p>Your LawBid sign-in code:</p>`,
    `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(input.code)}</p>`,
    `<p>It expires in ${input.ttlMinutes} minutes.</p>`,
    ...(links ? [htmlLinks(links, 'Sign in to LawBid')] : []),
    `<p style="font-size:12px">If you didn't request this code, you can ignore this email.</p>`,
  ].join('');
  return { to: input.email, subject: 'Your LawBid code', text, html };
}

/** Contact verification (POST /users/me/contacts/request): code only. */
export function buildContactOtpEmail(input: {
  email: string;
  code: string;
  ttlMinutes: number;
}): EmailMessage {
  const text = [
    `Your LawBid verification code: ${input.code}`,
    `It expires in ${input.ttlMinutes} minutes.`,
    '',
    "If you didn't request this code, you can ignore this email.",
  ].join('\n');
  const html = [
    `<p>Your LawBid verification code:</p>`,
    `<p style="font-size:24px;font-weight:bold;letter-spacing:4px">${escapeHtml(input.code)}</p>`,
    `<p>It expires in ${input.ttlMinutes} minutes.</p>`,
  ].join('');
  return {
    to: input.email,
    subject: 'Your LawBid verification code',
    text,
    html,
  };
}

/**
 * docs/01 §10.6: "Уведомление пользователю о входе с нового устройства
 * (push/email)". Links to Active devices, where the user can end the
 * session or sign out everywhere (§10.4). `deviceName`/`platform` are
 * client-supplied — escaped in HTML, length-capped by DeviceInfoDto.
 */
export function buildNewDeviceEmail(input: {
  email: string;
  deviceName?: string;
  platform?: string;
  at: Date;
  appLinkBaseUrl?: string;
}): EmailMessage {
  const links = buildAppLinks(
    ACTIVE_DEVICES_LINK_PATH,
    undefined,
    input.appLinkBaseUrl,
  );
  const device =
    [input.deviceName, input.platform].filter(Boolean).join(' · ') ||
    'an unrecognized device';
  const when = `${input.at.toISOString().replace('T', ' ').slice(0, 16)} UTC`;
  const text = [
    'New sign-in to your LawBid account',
    '',
    `Device: ${device}`,
    `Time: ${when}`,
    '',
    "If this was you, there's nothing to do.",
    "If it wasn't, open Active devices and sign out of that device (or everywhere):",
    textLinks(links),
  ].join('\n');
  const html = [
    `<p><strong>New sign-in to your LawBid account</strong></p>`,
    `<p>Device: ${escapeHtml(device)}<br>Time: ${escapeHtml(when)}</p>`,
    `<p>If this was you, there's nothing to do. If it wasn't, sign out of that device (or everywhere):</p>`,
    htmlLinks(links, 'Review active devices'),
  ].join('');
  return {
    to: input.email,
    subject: 'New sign-in to your LawBid account',
    text,
    html,
  };
}

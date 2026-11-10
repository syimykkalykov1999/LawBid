import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { fixtures, RESULTS_DIR, WEB_URL } from '../lib/env';
import { record, short, Watch, type Status } from '../lib/probe';

// The Flutter web build (apps/mobile, path URL strategy). Flutter paints on a
// canvas, so the suite turns on Flutter's accessibility tree
// (flt-semantics) and works with its roles and labels.
const FILE = 'web.jsonl';
const MAX_CONTROLS = Number(process.env.WEB_MAX_CONTROLS ?? 14);

// Screens from the bottom bar and the profile/settings menu
// (core/navigation/app_routes.dart + feature routes). [id] screens are
// opened from the lists by the click pass.
const COMMON = [
  '/feed', '/search', '/mine', '/profile', '/create', '/inbox', '/inbox/archive', '/inbox/requests',
  '/channels', '/questions', '/tag/law', '/stories/archive',
  '/profile/settings', '/profile/edit', '/profile/settings/account', '/profile/settings/notifications',
  '/profile/settings/privacy', '/profile/settings/privacy/decisions', '/profile/settings/privacy/reports',
  '/profile/settings/devices', '/profile/settings/contacts', '/profile/settings/phone-contacts',
  '/profile/settings/blocked', '/profile/settings/data-export', '/profile/settings/storage',
  '/profile/settings/about', '/profile/settings/saved', '/profile/settings/payments',
  '/profile/settings/archive', '/profile/settings/referral', '/profile/settings/support',
  '/profile/settings/support/new', '/profile/settings/case-history', '/profile/settings/stars',
  '/profile/settings/stars/gifts', '/profile/settings/verify-account', '/profile/settings/consultations',
  '/profile/settings/client-plan', '/profile/settings/case-payments', '/legal/terms', '/qr/my', '/trust/me',
  '/consultations', '/deadlines',
];
const ATTORNEY_ONLY = [
  '/profile/practices', '/mine/invites', '/mine/completed', '/profile/settings/templates',
  '/profile/settings/stats', '/profile/settings/promotions', '/profile/settings/bid-packs',
  '/profile/settings/firm', '/profile/settings/partner', '/profile/settings/subscription',
  '/profile/settings/subscription/payments', '/profile/settings/payouts', '/team', '/team/roles',
  '/tasks/new', '/tasks/archive', '/verification',
];

async function enableSemantics(page: Page): Promise<void> {
  await page.waitForSelector('flutter-view, flt-glass-pane', { timeout: 45_000 });
  await page.evaluate(() => {
    const p = document.querySelector('flt-semantics-placeholder') as HTMLElement | null;
    p?.click();
  });
  await page.waitForTimeout(800);
}

async function tapText(page: Page, text: RegExp): Promise<void> {
  const el = page.locator('flt-semantics[role=button]').filter({ hasText: text }).last();
  const b = await el.boundingBox({ timeout: 8_000 });
  if (!b) throw new Error(`no button ${text}`);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(1500);
}

async function settleWeb(page: Page, ms = 1800): Promise<void> {
  await page.waitForTimeout(ms);
  await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => undefined);
}

/** Text of the accessibility tree: what a user (or screen reader) sees. */
async function screenText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const host = document.querySelector('flt-semantics-host');
    if (!host) return '';
    const parts: string[] = [];
    host.querySelectorAll('*').forEach((el) => {
      const l = el.getAttribute('aria-label');
      if (l) parts.push(l);
      if (el.children.length === 0 && el.textContent?.trim()) parts.push(el.textContent.trim());
    });
    return parts.join(' | ');
  });
}

interface Ctl {
  label: string;
  role: string;
  x: number;
  y: number;
}

async function controls(page: Page): Promise<Ctl[]> {
  return page.evaluate(() => {
    const out: { label: string; role: string; x: number; y: number }[] = [];
    document
      .querySelectorAll<HTMLElement>(
        'flt-semantics[role=button], flt-semantics[role=switch], flt-semantics[role=tab], flt-semantics[role=checkbox], flt-semantics[role=link], flt-semantics[flt-tappable]',
      )
      .forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
        const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
        if (el.getAttribute('aria-disabled') === 'true') return;
        out.push({ label: label || '(no label)', role: el.getAttribute('role') ?? 'tappable', x: r.left + r.width / 2, y: r.top + r.height / 2 });
      });
    // De-duplicate nested nodes at the same point.
    const seen = new Set<string>();
    return out.filter((c) => {
      const k = `${Math.round(c.x / 8)}:${Math.round(c.y / 8)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });
}

const SKIP = /Выйти|Log ?out|Sign ?out|Удалить аккаунт|Delete account|Позвонить|Видеозвонок|Call/i;

function judge(net: { method: string; url: string; status: number; body?: string }[], errors: string[]): { status: Status; why: string } | null {
  const bad = net.filter((e) => e.status >= 400 || e.status === 0);
  if (!bad.length && !errors.length) return null;
  const why = [
    ...bad.map((e) => `${e.method} ${short(e.url)} → ${e.status || e.body}${/"code":"([A-Z_]+)"/.exec(e.body ?? '')?.[1] ? ' ' + /"code":"([A-Z_]+)"/.exec(e.body ?? '')![1] : ''}`),
    ...errors.map((c) => `console: ${c}`),
  ].join(' | ');
  return { status: bad.some((e) => e.status >= 500 || e.status === 0) || errors.length ? 'ERROR' : 'BROKEN', why };
}

async function login(page: Page, who: { phone: string; password: string }, role: string): Promise<boolean> {
  const watch = new Watch(page);
  const t0 = Date.now();
  // Signed-out visitors land on /welcome: accept the analytics notice,
  // then «Войти» opens the phone + password form.
  await page.goto(`${WEB_URL}/welcome`);
  await enableSemantics(page);
  await settleWeb(page, 2500);
  let loginOk: Promise<boolean> = Promise.resolve(false);
  try {
    await tapText(page, /Я понимаю|I understand/).catch(() => undefined);
    await page.waitForTimeout(500);
    const phoneInput = page.locator('input[aria-label="Номер телефона"], input[aria-label="Phone number"]');
    // Guest browsing on: the visitor lands on the feed with a «Sign in»
    // bar; off: on /welcome with «Войти». Either leads to the form.
    for (let i = 0; i < 6 && (await phoneInput.count()) === 0; i++) {
      await tapText(page, /^(Войти|Sign in|Log in)$/).catch(() => undefined);
      await page.waitForTimeout(1000);
      await enableSemantics(page).catch(() => undefined);
    }
    for (const [sel, value] of [
      ['input[aria-label="Номер телефона"], input[aria-label="Phone number"]', who.phone],
      ['input[aria-label="Пароль"], input[aria-label="Password"]', who.password],
    ] as const) {
      const input = page.locator(sel).first();
      await input.click({ timeout: 10_000, force: true });
      await page.waitForTimeout(400);
      await page.waitForTimeout(400);
      await input.pressSequentially(value, { delay: 60 });
      await page.waitForTimeout(300);
    }
    // Signed in = the account itself answers (the «other device» path signs
    // in through another call, so the login answer alone is not enough).
    loginOk = page
      .waitForResponse((r) => /\/api\/v1\/users\/me(\?|$)/.test(r.url()) && r.status() === 200, { timeout: 45_000 })
      .then(() => true)
      .catch(() => false);
    await tapText(page, /^(Войти|Sign in|Log in)$/);
  } catch (e) {
    record(FILE, { area: `web/${role}`, page: '/auth/login', element: 'phone + password form', expected: 'fields can be typed into', actual: String(e).split('\n')[0], status: 'BROKEN', screenshot: await shot(page, role, 'login') });
    return false;
  }
  await settleWeb(page, 3000);
  // One phone + one website per account: confirm signing the other one out.
  await tapText(page, /Продолжить и выйти там|Continue and sign out/).catch(() => undefined);
  await settleWeb(page, 3000);
  // «Secure your sign-in: Face ID» nudge after the first sign-in.
  await tapText(page, /^(Позже|Later)$/).catch(() => undefined);
  // A new device may ask for the SMS code (local dev code 000000).
  const txt = await screenText(page);
  if (/код|code/i.test(txt) && new URL(page.url()).pathname.includes('otp')) {
    await page.locator('flt-semantics input').first().click().catch(() => undefined);
    await page.keyboard.type('000000', { delay: 30 });
    await settleWeb(page, 4000);
  }
  const signedIn = await loginOk;
  await settleWeb(page, 2500);
  // First sign-in of a seeded account: walk the onboarding (consents, …).
  for (let step = 0; step < 8 && new URL(page.url()).pathname.startsWith('/onboarding'); step++) {
    const at = new URL(page.url()).pathname;
    await enableSemantics(page).catch(() => undefined);
    const boxes = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('flt-semantics[role=checkbox], flt-semantics[aria-checked="false"]')]
        .filter((e) => e.getAttribute('aria-checked') !== 'true')
        .map((e) => {
          const r = e.getBoundingClientRect();
          return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        }),
    );
    for (const b of boxes) {
      await page.mouse.click(b.x, b.y);
      await page.waitForTimeout(300);
    }
    await tapText(page, /^(Продолжить|Далее|Готово|Пропустить|Начать|Continue|Next|Done|Skip)$/).catch(() => undefined);
    await settleWeb(page, 2500);
    record(FILE, { area: `web/${role}`, page: at, element: 'onboarding step (tick all, continue)', expected: 'moves to the next step', actual: `now on ${new URL(page.url()).pathname}`, status: new URL(page.url()).pathname === at ? 'BROKEN' : 'WORKS', screenshot: await shot(page, role, `onboarding_${step}`) });
  }
  const path = new URL(page.url()).pathname;
  // Guest browsing shows the feed to signed-out visitors too, so the
  // address alone proves nothing: a 2xx sign-in answer does.
  const ok = signedIn && !path.startsWith('/auth') && !path.startsWith('/welcome') && !path.startsWith('/onboarding');
  const j = judge(watch.since(t0).net, watch.since(t0).console.map((c) => c.text));
  record(FILE, {
    area: `web/${role}`,
    page: '/auth/login',
    element: 'sign in (phone + password)',
    expected: 'signs in and opens the app',
    actual: ok ? `opened ${path}${j ? '; ' + j.why : ''}` : `still on ${path}; ${j?.why ?? ''} ${txt.slice(0, 200)}`,
    status: ok ? 'WORKS' : j?.status ?? 'BROKEN',
    screenshot: await shot(page, role, 'login'),
  });
  return ok;
}

async function shot(page: Page, role: string, name: string): Promise<string> {
  const p = join(RESULTS_DIR, 'shots', `web_${role}_${name.replace(/[^a-z0-9а-яё]+/gi, '_').slice(0, 70)}.png`);
  await page.screenshot({ path: p }).catch(() => undefined);
  return p;
}

const ERROR_TEXT = /Что-то пошло не так|Не удалось|Ошибка|Something went wrong|Failed to|Error|Нет соединения|No connection/i;

// The web build opens only the four tabs and public links from a typed
// address (core/deeplinks/deep_link.dart `_webTabs`); every other screen is
// reached the way a person does: by tapping. So the crawl starts at the
// tabs (+ the address list for a load check) and follows taps two levels
// deep, auditing each newly opened screen once.
const START = ['/feed', '/search', '/mine', '/profile'];
const DEPTH = Number(process.env.WEB_DEPTH ?? 2);

async function openFresh(page: Page, route: string): Promise<void> {
  await page.goto(`${WEB_URL}${route}`).catch(() => undefined);
  await enableSemantics(page).catch(() => undefined);
  await settleWeb(page, 2500);
}

async function auditScreen(
  page: Page,
  watch: Watch,
  role: string,
  path: string,
  reach: () => Promise<void>,
  depth: number,
  seen: Set<string>,
): Promise<void> {
  seen.add(path);
  const list = (await controls(page)).slice(0, depth === 0 ? MAX_CONTROLS : Math.ceil(MAX_CONTROLS / 2));
  const baseline = await screenText(page);
  for (const c of list) {
    if (SKIP.test(c.label)) continue;
    // Back to the screen as it was: a pushed screen keeps the address, so
    // compare what is shown, not only the URL.
    if (new URL(page.url()).pathname !== path || (await screenText(page)) !== baseline) {
      await reach();
    }
    const before = await screenText(page);
    const url0 = page.url();
    const t1 = Date.now();
    await page.mouse.click(c.x, c.y);
    await settleWeb(page, 1500);
    const after = await screenText(page);
    const s1 = watch.since(t1);
    const j1 = judge(s1.net, s1.console.map((x) => x.text));
    const moved = page.url() !== url0;
    const landed = new URL(page.url()).pathname;
    const parts: string[] = [];
    if (moved) parts.push(`opened ${landed}`);
    if (after !== before) parts.push('screen changed');
    const calls = s1.net.filter((e) => e.status > 0 && e.status < 400);
    if (calls.length) parts.push(calls.slice(0, 3).map((e) => `${e.method} ${short(e.url)} ${e.status}`).join(', '));
    let status: Status = 'WORKS';
    let actual = parts.join('; ');
    if (j1) {
      status = j1.status;
      actual = j1.why;
    } else if (!parts.length) {
      status = 'DEAD BUTTON';
      actual = 'nothing happened (no request, no screen change)';
    } else if (ERROR_TEXT.test(after) && !ERROR_TEXT.test(before)) {
      status = 'BROKEN';
      actual = `error text appeared: ${after.slice(0, 160)}`;
    }
    record(FILE, {
      area: `web/${role}`,
      page: path,
      element: `${c.role} «${c.label}»`,
      expected: 'does its action',
      actual,
      status,
      screenshot: status === 'WORKS' ? undefined : await shot(page, role, `${path}__${c.label}`),
    });
    if (moved && depth + 1 < DEPTH && !seen.has(landed) && status === 'WORKS') {
      const loadShot = await shot(page, role, landed);
      record(FILE, { area: `web/${role}`, page: landed, element: '(screen load)', expected: 'opens, data loads, no failed calls', actual: `opened from ${path} «${c.label}»${ERROR_TEXT.test(after) ? ' | error text on screen' : ''}`, status: ERROR_TEXT.test(after) ? 'BROKEN' : 'WORKS', screenshot: loadShot });
      const label = c;
      await auditScreen(
        page,
        watch,
        role,
        landed,
        async () => {
          await reach();
          await page.mouse.click(label.x, label.y);
          await settleWeb(page, 1800);
        },
        depth + 1,
        seen,
      );
    }
    // Close a sheet/dialog or come back.
    await page.keyboard.press('Escape').catch(() => undefined);
    if (moved) await page.goBack().catch(() => undefined);
    await page.waitForTimeout(500);
  }
}

for (const role of ['client', 'attorney'] as const) {
  test(`web ${role}`, async ({ page }) => {
    test.setTimeout(3 * 60 * 60_000);
    await page.setViewportSize({ width: 430, height: 900 });
    const who = fixtures[role];
    if (!(await login(page, who, role))) return;
    const watch = new Watch(page);
    const only = process.env.WEB_ROUTES?.split(',').filter(Boolean);
    // 1) Address check: which screens open from a typed / refreshed address.
    const addresses = role === 'attorney' ? [...COMMON, ...ATTORNEY_ONLY] : COMMON;
    if (process.env.WEB_ADDRESSES !== '0') {
      for (const route of only ? addresses.filter((r) => only.includes(r)) : addresses) {
        const t0 = Date.now();
        await openFresh(page, route);
        const s = watch.since(t0);
        const j = judge(s.net, s.console.map((c) => c.text));
        const landed = new URL(page.url()).pathname;
        record(FILE, {
          area: `web/${role}`,
          page: route,
          element: '(typed address / refresh)',
          expected: 'the same screen opens',
          actual: j ? j.why : landed === route.split('?')[0] ? 'ok' : `lands on ${landed}`,
          status: j ? j.status : landed === route.split('?')[0] ? 'WORKS' : 'BROKEN',
          screenshot: landed === route.split('?')[0] && !j ? undefined : await shot(page, role, `addr_${route}`),
        });
      }
    }
    // 2) Tap crawl from the tabs.
    const seen = new Set<string>();
    for (const start of only ? START.filter((r) => only.includes(r)) : START) {
      const t0 = Date.now();
      await openFresh(page, start);
      const text = await screenText(page);
      const s = watch.since(t0);
      const j = judge(s.net, s.console.map((c) => c.text));
      record(FILE, {
        area: `web/${role}`,
        page: start,
        element: '(screen load)',
        expected: 'opens, data loads, no failed calls',
        actual: j ? j.why : ERROR_TEXT.test(text) ? `error text: ${text.slice(0, 160)}` : `ok (${s.net.length} calls)`,
        status: j ? j.status : ERROR_TEXT.test(text) ? 'BROKEN' : 'WORKS',
        screenshot: await shot(page, role, start),
      });
      await auditScreen(page, watch, role, start, () => openFresh(page, start), 0, seen);
    }
  });
}

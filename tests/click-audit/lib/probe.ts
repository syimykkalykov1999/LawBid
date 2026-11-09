import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { RESULTS_DIR } from './env';

export type Status = 'WORKS' | 'BROKEN' | 'DEAD BUTTON' | 'ERROR' | 'SKIPPED';

export interface Row {
  area: string;
  page: string;
  element: string;
  expected: string;
  actual: string;
  status: Status;
  screenshot?: string;
}

/** Noise that is not the page's fault (dev server, browser, extensions). */
const IGNORED_URL = /(_next\/webpack-hmr|__nextjs|favicon|\.hot-update\.|sentry|\/_next\/static\/)/;
const IGNORED_CONSOLE =
  // «Failed to load resource» repeats a failed response the network watch
  // already records with its URL.
  // «Encountered a script tag»: React 19 dev-only warning about the theme
  // script in the root layout (not shown in production builds).
  /(Download the React DevTools|\[HMR\]|\[Fast Refresh\]|webpack-hmr|Failed to load resource|Encountered a script tag while rendering)/;

/** Never pressed: they end the audit's own session. */
export const SKIP_TEXT = /^(Выйти|Выход|Log ?out|Sign ?out)$|Выйти из|Завершить (все|эту) сесси|Удалить (мой|свой) аккаунт/i;
/** Pages whose rows include the audit's own session: never press there. */
export const SKIP_ON_PAGE: Record<string, RegExp> = { '/sessions': /^Завершить$/ };

export interface NetEvent {
  t: number;
  method: string;
  url: string;
  status: number;
  body?: string;
}

export class Watch {
  net: NetEvent[] = [];
  console: { t: number; text: string }[] = [];
  constructor(private page: Page) {
    page.on('response', async (r) => {
      const url = r.url();
      if (IGNORED_URL.test(url)) return;
      const ev: NetEvent = { t: Date.now(), method: r.request().method(), url, status: r.status() };
      this.net.push(ev);
      if (r.status() >= 400) {
        try {
          ev.body = (await r.text()).slice(0, 300);
        } catch {
          /* body gone */
        }
      }
    });
    page.on('requestfailed', (r) => {
      const url = r.url();
      if (IGNORED_URL.test(url)) return;
      const err = r.failure()?.errorText ?? 'failed';
      // Aborted by navigation / React Query cancel: not a server fault.
      if (/ERR_ABORTED|NS_BINDING_ABORTED|cancel/i.test(err)) return;
      this.net.push({ t: Date.now(), method: r.method(), url, status: 0, body: err });
    });
    page.on('console', (m) => {
      if (m.type() !== 'error') return;
      const text = m.text();
      if (IGNORED_CONSOLE.test(text)) return;
      this.console.push({ t: Date.now(), text: text.slice(0, 300) });
    });
    page.on('pageerror', (e) => this.console.push({ t: Date.now(), text: `pageerror: ${e.message}`.slice(0, 300) }));
  }
  since(t: number) {
    return {
      net: this.net.filter((e) => e.t >= t),
      console: this.console.filter((e) => e.t >= t),
    };
  }
}

export function short(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/^\/api\/proxy/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/g, ':id') + (u.search ? '?…' : '');
  } catch {
    return url;
  }
}

function failures(net: NetEvent[]): NetEvent[] {
  return net.filter((e) => e.status >= 400 || e.status === 0);
}

function describeFail(e: NetEvent): string {
  const code = /"code":"([A-Z_]+)"/.exec(e.body ?? '')?.[1];
  return `${e.method} ${short(e.url)} → ${e.status || e.body}${code ? ` ${code}` : ''}`;
}

export function record(file: string, row: Row): void {
  mkdirSync(RESULTS_DIR, { recursive: true });
  appendFileSync(join(RESULTS_DIR, file), JSON.stringify(row) + '\n');
}

export async function settle(page: Page, ms = 1500): Promise<void> {
  // Pages poll in the background, so «network idle» may never come: a short
  // fixed wait, then idle only if it comes quickly.
  await page.waitForTimeout(ms);
  await page.waitForLoadState('networkidle', { timeout: 1500 }).catch(() => undefined);
}

/** Load check: no console errors, no failed calls, some content. */
export async function checkLoad(page: Page, watch: Watch, area: string, route: string, shot: string, file: string, retried = false): Promise<Row> {
  const t0 = Date.now();
  let navError = '';
  try {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
  } catch (e) {
    navError = String(e).slice(0, 200);
  }
  await settle(page, 2500);
  await page.screenshot({ path: shot, fullPage: true }).catch(() => undefined);
  const { net, console } = watch.since(t0);
  const bad = failures(net);
  const text = (await page.locator('main').first().innerText().catch(() => '')).trim();
  const problems: string[] = [];
  if (navError) problems.push(navError);
  bad.forEach((e) => problems.push(describeFail(e)));
  console.forEach((c) => problems.push(`console: ${c.text}`));
  if (!navError && text.length < 3) problems.push('empty page');
  const redirected = new URL(page.url()).pathname;
  if (redirected !== route.split('?')[0]) problems.push(`redirected to ${redirected}`);
  // The dev server compiles a page on its first visit and React may report
  // a hydration mismatch only then: look once more before calling it broken.
  if (!retried && console.some((c) => /Hydration failed/.test(c.text))) {
    return checkLoad(page, watch, area, route, shot, file, true);
  }
  const status: Status = problems.length === 0
    ? 'WORKS'
    : bad.some((e) => e.status >= 500 || e.status === 0) || console.length || navError
      ? 'ERROR'
      : 'BROKEN';
  const row: Row = {
    area,
    page: route,
    element: '(page load)',
    expected: 'opens, data loads, no console errors, no failed calls',
    actual: problems.length ? problems.join(' | ') : `ok (${net.length} calls)`,
    status,
    screenshot: shot,
  };
  record(file, row);
  return row;
}

interface Desc {
  key: string;
  label: string;
  kind: string;
  disabled: boolean;
  selected: boolean;
}

/** Tags every control inside [scope] and returns stable descriptions. */
export async function listControls(page: Page, scope: string): Promise<Desc[]> {
  return page.evaluate((scopeSel) => {
    const root = document.querySelector(scopeSel);
    if (!root) return [];
    const seen = new Map<string, number>();
    const out: { key: string; label: string; kind: string; disabled: boolean; selected: boolean }[] = [];
    const els = root.querySelectorAll<HTMLElement>(
      'button, [role=switch], [role=tab], [role=checkbox], [role=menuitem], select, input[type=checkbox], summary',
    );
    els.forEach((el) => {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') return;
      // Inside a closed <details>: not reachable until its summary is opened.
      const det = el.closest('details');
      if (det && !det.open && el.tagName !== 'SUMMARY') return;
      if (el.closest('[aria-live]')) return;
      const role = el.getAttribute('role') ?? el.tagName.toLowerCase();
      const label = (
        el.getAttribute('aria-label') ||
        el.innerText ||
        el.getAttribute('title') ||
        (el as HTMLInputElement).name ||
        ''
      )
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 70);
      const base = `${role}:${label}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const key = `${base}#${n}`;
      el.setAttribute('data-audit-key', key);
      out.push({
        key,
        label: label || `(${role} without label)`,
        kind: role,
        disabled: (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true',
        selected:
          el.getAttribute('aria-selected') === 'true' ||
          el.getAttribute('data-state') === 'active' ||
          (role === 'radio' && (el.getAttribute('aria-checked') === 'true' || (el as HTMLInputElement).checked === true)),
      });
    });
    return out;
  }, scope);
}

async function installObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __mut?: number; __obs?: MutationObserver };
    if (w.__obs) return;
    w.__mut = 0;
    w.__obs = new MutationObserver((list) => {
      w.__mut = (w.__mut ?? 0) + list.length;
    });
    w.__obs.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

async function mutations(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __mut?: number }).__mut ?? 0).catch(() => 0);
}

async function stateOf(loc: Locator): Promise<string> {
  return loc
    .evaluate((el) =>
      ['aria-checked', 'aria-pressed', 'aria-selected', 'aria-expanded', 'data-state', 'value']
        .map((a) => `${a}=${el.getAttribute(a) ?? (a === 'value' ? (el as HTMLSelectElement).value ?? '' : '')}`)
        .join(',') + `,open=${el.closest('details')?.open ?? ''},checked=${(el as HTMLInputElement).checked ?? ''}`,
    )
    .catch(() => 'gone');
}

async function errorToast(page: Page): Promise<string> {
  return page
    .locator('[aria-live] .text-danger')
    .first()
    .locator('xpath=ancestor::div[1]')
    .innerText({ timeout: 300 })
    .catch(() => '');
}

async function anyToast(page: Page): Promise<string> {
  return (await page.locator('[aria-live]').first().innerText({ timeout: 300 }).catch(() => '')).trim();
}

export interface ClickResult {
  status: Status;
  actual: string;
  dialog: boolean;
  navigated: boolean;
}

/** Clicks one control and judges what happened. */
export async function clickAndJudge(page: Page, watch: Watch, loc: Locator, kind: string): Promise<ClickResult> {
  await installObserver(page);
  const url0 = page.url();
  const dialogs0 = await page.locator('[role=dialog]:visible, [role=alertdialog]:visible').count();
  const st0 = await stateOf(loc);
  // A submit button of a form with empty required fields: the browser shows
  // its own «fill this in» bubble (not in the DOM).
  const invalidForm = await loc
    .evaluate((el) => {
      const b = el as HTMLButtonElement;
      return Boolean(b.form && (b.type === 'submit' || !b.getAttribute('type')) && !b.form.checkValidity());
    })
    .catch(() => false);
  const toast0 = await anyToast(page);
  // Background rate (tickers, polling) over the same window as after the click.
  const m0 = await mutations(page);
  await page.waitForTimeout(400);
  const background = (await mutations(page)) - m0;
  const t0 = Date.now();
  const m1 = await mutations(page);
  let popup = false;
  page.context().once('page', () => {
    popup = true;
  });
  let download = false;
  page.once('download', () => {
    download = true;
  });
  try {
    if (kind === 'select') {
      const opts = await loc.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value));
      const cur = await loc.inputValue();
      const next = opts.find((v) => v !== cur);
      if (!next) return { status: 'SKIPPED', actual: 'select with one option', dialog: false, navigated: false };
      await loc.selectOption(next);
    } else {
      try {
        await loc.click({ timeout: 4000 });
      } catch {
        // Covered by its own label / styled overlay: press it the way a
        // user's tap on the visible part would.
        await loc.dispatchEvent('click');
      }
    }
  } catch (e) {
    return { status: 'BROKEN', actual: `could not click: ${String(e).split('\n')[0].slice(0, 120)}`, dialog: false, navigated: false };
  }
  await settle(page, 900);
  const { net, console } = watch.since(t0);
  const changed = (await mutations(page)) - m1;
  const dialogs1 = await page.locator('[role=dialog]:visible, [role=alertdialog]:visible').count();
  const navigated = page.url() !== url0;
  const st1 = await stateOf(loc);
  const parts0: string[] = [];
  // 403 ADMIN_STEP_UP_REQUIRED is the designed «enter your code» answer.
  const stepUp = net.some((e) => e.status === 403 && /ADMIN_STEP_UP_REQUIRED/.test(e.body ?? ''));
  const bad = failures(net).filter((e) => !(e.status === 403 && /ADMIN_STEP_UP_REQUIRED/.test(e.body ?? '')));
  if (stepUp) parts0.push('asked for the authenticator code (step-up)');
  const toastErrNow = await errorToast(page);
  const toastErr = toastErrNow && !toast0.includes(toastErrNow) ? toastErrNow : '';
  const toast = await anyToast(page);
  const parts: string[] = [...parts0];
  if (navigated) parts.push(`opened ${new URL(page.url()).pathname}`);
  if (dialogs1 > dialogs0) parts.push('opened a dialog');
  if (st0 !== st1 && st1 !== 'gone') parts.push('state changed');
  if (popup) parts.push('opened a new tab');
  if (download) parts.push('started a download');
  const calls = net.filter((e) => e.status > 0 && e.status < 400);
  if (calls.length) parts.push(calls.slice(0, 3).map((e) => `${e.method} ${short(e.url)} ${e.status}`).join(', '));
  if (toast && toast !== toast0 && !toastErr) parts.push(`toast «${toast.slice(0, 80)}»`);
  if (bad.length || console.length || toastErr) {
    const why = [
      ...bad.map(describeFail),
      ...console.map((c) => `console: ${c.text}`),
      ...(toastErr ? [`error toast «${toastErr.slice(0, 120)}»`] : []),
    ].join(' | ');
    const status: Status = bad.some((e) => e.status >= 500 || e.status === 0) || console.length ? 'ERROR' : 'BROKEN';
    return { status, actual: why, dialog: dialogs1 > dialogs0, navigated };
  }
  if (parts.length === 0 && invalidForm) {
    return { status: 'WORKS', actual: 'form not sent: required fields are empty (browser asks to fill them)', dialog: false, navigated };
  }
  if (parts.length === 0 && changed <= background * 3 + 3) {
    return { status: 'DEAD BUTTON', actual: 'nothing happened (no request, no dialog, no change)', dialog: false, navigated };
  }
  return { status: 'WORKS', actual: parts.join('; ') || 'page updated', dialog: dialogs1 > dialogs0, navigated };
}

/** Closes whatever the last click left open. */
export async function closeOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const open = page.locator('[role=dialog]:visible, [role=alertdialog]:visible, [role=menu]:visible');
    if ((await open.count()) === 0) return;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  const cancel = page
    .locator('[role=dialog]:visible')
    .getByRole('button', { name: /Отмена|Закрыть|Cancel|Close/i })
    .first();
  if (await cancel.count()) await cancel.click({ timeout: 2000 }).catch(() => undefined);
}

import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { test, type Page } from '@playwright/test';
import { adminLogin, freshCode } from '../lib/admin-auth';
import { ADMIN_URL, AUTH_DIR, REPO, RESULTS_DIR } from '../lib/env';
import { checkLoad, clickAndJudge, closeOverlays, listControls, record, settle, SKIP_ON_PAGE, SKIP_TEXT, Watch } from '../lib/probe';

// Every admin route (apps/admin/src/app/(app)/**/page.tsx): load check, then
// every control in <main> is clicked once and judged; a dialog it opens gets
// its main button pressed too (empty forms → validation is the expected answer).
const APP_DIR = join(REPO, 'apps', 'admin', 'src', 'app', '(app)');
const FILE = 'admin.jsonl';
const MAX_CONTROLS = Number(process.env.MAX_CONTROLS ?? 30);

function pages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...pages(p));
    else if (name === 'page.tsx') {
      const rel = relative(APP_DIR, dir).split(sep).join('/');
      out.push('/' + rel);
    }
  }
  return out;
}

const all = pages(APP_DIR)
  .map((r) => (r === '/' ? '/' : r.replace(/\/$/, '')))
  .sort((a, b) => Number(a.includes('[')) - Number(b.includes('[')) || a.localeCompare(b));
const only = process.env.ROUTES?.split(',').filter(Boolean);
const routes = only ? all.filter((r) => only.some((o) => r === o || r.startsWith(o + '/'))) : all;

/** Links seen while crawling, used to open the [id] pages with real ids. */
const seenLinks = new Set<string>();

function patternOf(route: string): RegExp {
  return new RegExp('^' + route.replace(/\[[^\]]+\]/g, '[^/?#]+') + '$');
}

test.use({ storageState: `${AUTH_DIR}/admin.json`, baseURL: ADMIN_URL });

async function ensureSession(page: Page): Promise<void> {
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await adminLogin(page);
  }
}

for (const route of routes) {
  test(`admin ${route}`, async ({ page }) => {
    const watch = new Watch(page);
    let target = route;
    if (route.includes('[')) {
      const re = patternOf(route);
      const hit = [...seenLinks].find((l) => re.test(l));
      if (!hit) {
        record(FILE, {
          area: 'admin',
          page: route,
          element: '(page load)',
          expected: 'opens from a link of its list page',
          actual: 'no link to this page found on any crawled page (no data in the local seed?)',
          status: 'SKIPPED',
        });
        return;
      }
      target = hit;
    }
    const slug = target.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'home';
    const shot = join(RESULTS_DIR, 'shots', `admin_${slug}.png`);
    await page.goto(target);
    await ensureSession(page);
    await checkLoad(page, watch, 'admin', target, shot, FILE);
    for (const href of await page.$$eval('a[href^="/"]', (as) => as.map((a) => a.getAttribute('href') ?? ''))) {
      seenLinks.add(href.split('#')[0]);
    }
    const controls = (await listControls(page, 'main')).slice(0, MAX_CONTROLS);
    for (const c of controls) {
      if (SKIP_TEXT.test(c.label) || SKIP_ON_PAGE[route]?.test(c.label)) {
        record(FILE, { area: 'admin', page: target, element: c.label, expected: 'ends own session', actual: 'not pressed on purpose', status: 'SKIPPED' });
        continue;
      }
      if ((c.kind === 'tab' || c.kind === 'radio') && c.selected) {
        record(FILE, { area: 'admin', page: target, element: `${c.kind} «${c.label}»`, expected: 'shows / sets its choice', actual: 'already the chosen one', status: 'WORKS' });
        continue;
      }
      if (c.disabled) {
        record(FILE, { area: 'admin', page: target, element: c.label, expected: 'enabled when usable', actual: 'disabled on load', status: 'SKIPPED' });
        continue;
      }
      // Back to the page as it was before this control.
      if (page.url() !== new URL(target, ADMIN_URL).toString()) {
        await page.goto(target).catch(() => undefined);
        await ensureSession(page);
        await settle(page, 800);
      }
      await closeOverlays(page);
      await listControls(page, 'main');
      let loc = page.locator(`[data-audit-key="${c.key.replace(/"/g, '\\"')}"]`).first();
      if ((await loc.count()) === 0) {
        // An earlier click changed the page (selection mode, opened row):
        // start from a fresh load.
        await page.goto(target).catch(() => undefined);
        await ensureSession(page);
        await settle(page, 800);
        await listControls(page, 'main');
        loc = page.locator(`[data-audit-key="${c.key.replace(/"/g, '\\"')}"]`).first();
      }
      if ((await loc.count()) === 0) {
        record(FILE, { area: 'admin', page: target, element: c.label, expected: 'present', actual: 'gone after an earlier click (list changed)', status: 'SKIPPED' });
        continue;
      }
      const r = await clickAndJudge(page, watch, loc, c.kind);
      let shotPath: string | undefined;
      if (r.status !== 'WORKS' && r.status !== 'SKIPPED') {
        shotPath = join(RESULTS_DIR, 'shots', `admin_${slug}__${c.key.replace(/[^a-z0-9а-яё]+/gi, '_').slice(0, 60)}.png`);
        await page.screenshot({ path: shotPath }).catch(() => undefined);
      }
      record(FILE, { area: 'admin', page: target, element: `${c.kind} «${c.label}»`, expected: 'does its action, UI shows the result', actual: r.actual, status: r.status, screenshot: shotPath });
      // Put switches back so later pages see the seeded settings.
      if ((c.kind === 'switch' || c.kind === 'checkbox') && r.status === 'WORKS' && !r.dialog && !r.navigated) {
        await loc.click({ timeout: 3000 }).catch(() => undefined);
        await settle(page, 700);
      }
      // Money / identity actions ask for the authenticator code first
      // (step-up): give it, then judge the action itself.
      const stepUp = page.locator('[role=dialog]:visible input[autocomplete="one-time-code"]');
      if (r.dialog && (await stepUp.count())) {
        await stepUp.first().fill(freshCode(30_000));
        const ok = page.locator('[role=dialog]:visible button[type=submit]').first();
        const d = await clickAndJudge(page, watch, ok, 'button');
        record(FILE, { area: 'admin', page: target, element: `«${c.label}» after step-up code`, expected: 'the action runs after the code', actual: d.actual, status: d.status });
        await closeOverlays(page);
        continue;
      }
      if (r.dialog) {
        const dlg = page.locator('[role=dialog]:visible, [role=alertdialog]:visible').last();
        const buttons = dlg.locator('button:visible');
        const n = await buttons.count();
        let primary = null;
        for (let i = n - 1; i >= 0; i--) {
          const b = buttons.nth(i);
          const t = ((await b.innerText().catch(() => '')) || (await b.getAttribute('aria-label')) || '').trim();
          if (!t || /Отмена|Закрыть|Cancel|Close|Назад/i.test(t) || SKIP_TEXT.test(t)) continue;
          primary = { b, t };
          break;
        }
        if (primary) {
          if (await primary.b.isDisabled()) {
            record(FILE, { area: 'admin', page: target, element: `dialog of «${c.label}» → «${primary.t}»`, expected: 'enabled once the form is filled', actual: 'disabled while the form is empty (validation)', status: 'WORKS' });
          } else {
            const d = await clickAndJudge(page, watch, primary.b, 'button');
            let dShot: string | undefined;
            if (d.status !== 'WORKS') {
              dShot = join(RESULTS_DIR, 'shots', `admin_${slug}__dlg_${c.key.replace(/[^a-z0-9а-яё]+/gi, '_').slice(0, 50)}.png`);
              await page.screenshot({ path: dShot }).catch(() => undefined);
            }
            record(FILE, { area: 'admin', page: target, element: `dialog of «${c.label}» → «${primary.t}»`, expected: 'submits or shows what is missing', actual: d.actual, status: d.status, screenshot: dShot });
          }
        }
        await closeOverlays(page);
      }
    }
    // Search box: typing must ask the server or filter the list.
    const search = page.locator('main input[type=search], main input[placeholder*="Поиск" i], main input[placeholder*="Найти" i]').first();
    if (await search.count()) {
      if (page.url() !== new URL(target, ADMIN_URL).toString()) await page.goto(target);
      await settle(page, 800);
      const r = await (async () => {
        const t0 = Date.now();
        const before = await page.locator('main').innerText().catch(() => '');
        await search.fill('demo').catch(() => undefined);
        await page.keyboard.press('Enter').catch(() => undefined);
        await settle(page, 1500);
        const after = await page.locator('main').innerText().catch(() => '');
        const calls = watch.since(t0).net;
        const bad = calls.filter((e) => e.status >= 400 || e.status === 0);
        if (bad.length) return { status: bad.some((e) => e.status >= 500 || e.status === 0) ? 'ERROR' : 'BROKEN', actual: bad.map((e) => `${e.method} ${e.url} → ${e.status}`).join(' | ') } as const;
        if (before === after && calls.length === 0) return { status: 'DEAD BUTTON', actual: 'typing changed nothing' } as const;
        return { status: 'WORKS', actual: `${calls.length} calls, list ${before === after ? 'same' : 'updated'}` } as const;
      })();
      record(FILE, { area: 'admin', page: target, element: 'search box «demo»', expected: 'filters / searches', actual: r.actual, status: r.status });
    }
  });
}

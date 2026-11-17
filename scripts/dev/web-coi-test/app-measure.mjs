// node app-measure.mjs <port> <label> [sw]
import { chromium } from "playwright-core";
const [port, label, swMode] = process.argv.slice(2);
const CHAT = process.env.CHAT; // id of the 400-message chat of seed:perf
const O = `http://127.0.0.1:${port}`;
const b = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errors = [];
p.on("console", (m) => {
  if (
    m.type() === "error" ||
    (m.type() === "warning" && /Skwasm|COEP|COOP|blocked/i.test(m.text()))
  )
    errors.push(m.type() + ": " + m.text().slice(0, 220));
});
p.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 200)));
p.on("requestfailed", (r) =>
  errors.push(
    "requestfailed " + r.url().slice(0, 100) + " " + r.failure()?.errorText,
  ),
);
const ready = async () => {
  await p.waitForSelector("flt-semantics[role=button]", { timeout: 120000 });
  await p.waitForTimeout(1500);
};
const out = { label };
await p.goto(O + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await ready();
await p
  .locator("flt-semantics[role=button]", { hasText: "Войти" })
  .first()
  .click();
await p.waitForTimeout(2500);
await p
  .locator('input[aria-label="Номер телефона"]')
  .first()
  .click({ force: true });
await p.waitForTimeout(600);
await p.keyboard.type("2125550190", { delay: 40 });
await p.locator('input[aria-label="Пароль"]').first().click({ force: true });
await p.waitForTimeout(600);
await p.keyboard.type("Test1234!", { delay: 40 });
await p.screenshot({ path: `login-${label}.png` });
await p.waitForTimeout(500);
await p
  .locator("flt-semantics[role=button]", { hasText: /^Войти$/ })
  .last()
  .click();
await p.waitForTimeout(8000);
out.after_login_url = p.url();
if (swMode) {
  // The admin switch is on (bootstrap): the app has told boot_head.js and the
  // worker is registered by now; the next load is isolated.
  out.sw_before_reload = await p.evaluate(async () =>
    (await navigator.serviceWorker.getRegistrations()).map(
      (r) => (r.active || r.installing || r.waiting)?.scriptURL,
    ),
  );
  out.stored_flag = await p.evaluate(() =>
    localStorage.getItem("flutter.web_cross_origin_isolation"),
  );
  out.isolated_before_reload = await p.evaluate(() => crossOriginIsolated);
}
await p.goto(`${O}/chat/${CHAT}`, {
  waitUntil: "domcontentloaded",
  timeout: 90000,
});
await ready();
await p.waitForTimeout(6000);
out.isolated = await p.evaluate(() => crossOriginIsolated);
out.controlled_by = await p.evaluate(
  () => navigator.serviceWorker.controller?.scriptURL || null,
);
out.workers = p.workers().map((w) => w.url().slice(0, 60));
out.skwasm_threads_note = out.workers.filter((u) =>
  u.startsWith("blob:"),
).length;
out.chat_text_seen = await p.evaluate(
  () =>
    /Perf message/.test(document.body.innerText) ||
    [...document.querySelectorAll("flt-semantics")].some((e) =>
      /Perf message/.test(e.textContent),
    ),
);
await p.screenshot({ path: `chat-${label}.png` });
// Frame recorder: rAF intervals + long tasks while the long chat scrolls.
await p.evaluate(() => {
  window.__f = [];
  window.__lt = [];
  let last = performance.now();
  const tick = (t) => {
    window.__f.push(t - last);
    last = t;
    if (window.__rec) requestAnimationFrame(tick);
  };
  window.__rec = true;
  requestAnimationFrame(tick);
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__lt.push(e.duration);
  }).observe({ type: "longtask", buffered: false });
});
await p.mouse.move(760, 450);
for (let round = 0; round < 3; round++) {
  for (let i = 0; i < 40; i++) {
    await p.mouse.wheel(0, -300);
    await p.waitForTimeout(30);
  }
  for (let i = 0; i < 40; i++) {
    await p.mouse.wheel(0, 300);
    await p.waitForTimeout(30);
  }
}
await p.waitForTimeout(500);
const f = await p.evaluate(() => {
  window.__rec = false;
  return { f: window.__f.slice(1), lt: window.__lt };
});
const s = [...f.f].sort((a, b) => a - b);
const q = (x) => s[Math.min(s.length - 1, Math.floor(x * s.length))];
out.frames = s.length;
out.p50_ms = +q(0.5).toFixed(2);
out.p90_ms = +q(0.9).toFixed(2);
out.p99_ms = +q(0.99).toFixed(2);
out.max_ms = +s[s.length - 1].toFixed(1);
out.over_16_7 = s.filter((x) => x > 16.7 * 1.5).length; // missed at least one vsync
out.over_33 = s.filter((x) => x > 33.4).length;
out.longtasks = f.lt.length;
out.longtask_ms = Math.round(f.lt.reduce((a, b) => a + b, 0));
out.errors = [...new Set(errors)].slice(0, 15);
console.log(JSON.stringify(out));
await b.close();

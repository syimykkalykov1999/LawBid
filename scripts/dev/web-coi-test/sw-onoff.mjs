import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
const sql = (v) =>
  execSync(
    `docker exec ${process.env.PG_CONTAINER || "coop173-pg"} psql -U root -d lawbid -qtAc "insert into app_config(key,value,updated_at) values ('web.cross_origin_isolation','${v}',now()) on conflict (key) do update set value=excluded.value" && docker exec ${process.env.REDIS_CONTAINER || "coop173-redis"} sh -c "redis-cli --scan --pattern 'config:*' | grep -v '^config:version$' | xargs -r redis-cli del; redis-cli incr config:version" >/dev/null`,
  );
const O = "http://127.0.0.1:8173";
const b = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
});
const ctx = await b.newContext();
const p = await ctx.newPage();
const errs = [];
p.on("console", (m) => {
  if (m.type() === "error") errs.push(m.text().slice(0, 150));
});
let blocked = [];
p.on("requestfailed", (r) => {
  if (/BLOCKED/.test(r.failure()?.errorText || ""))
    blocked.push(r.url().slice(-30));
});
const state = async (tag) => {
  const s = await p.evaluate(async () => ({
    isolated: crossOriginIsolated,
    controller: navigator.serviceWorker.controller?.scriptURL || null,
    regs: (await navigator.serviceWorker.getRegistrations()).length,
    flag: localStorage.getItem("flutter.web_cross_origin_isolation"),
  }));
  s.blocked = blocked;
  blocked = [];
  console.log(tag, JSON.stringify(s));
};
const load = async (path, tag, wait = 9000) => {
  await p.goto(O + path, { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(wait);
  await state(tag);
};
sql("true");
await new Promise((r) => setTimeout(r, 6000));
await load("/", "ON  load1 (first visit)");
await load("/", "ON  load2");
await load("/pay.html", "ON  /pay.html", 2000);
await load("/about/", "ON  /about/", 2000);
await load("/feed", "ON  /feed (app screen)", 3000);
sql("false");
await new Promise((r) => setTimeout(r, 6000));
await load("/", "OFF load3 (still served by the worker, app hears off)");
await load("/", "OFF load4");
console.log("console errors:", JSON.stringify([...new Set(errs)]));
await b.close();

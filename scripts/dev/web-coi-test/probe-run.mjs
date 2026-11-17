import { chromium } from "playwright-core";
const browser = await chromium.launch({
  executablePath: process.env.CHROME || "/usr/bin/google-chrome",
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
console.log("chrome", browser.version());
for (const [mode, port] of [
  ["none", 8173],
  ["credentialless", 8174],
  ["require-corp", 8175],
  ["allow-popups+credentialless", 8176],
]) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });
  page.on("requestfailed", (r) =>
    errors.push(
      "requestfailed " + r.url().slice(0, 90) + " " + r.failure()?.errorText,
    ),
  );
  await page.goto(
    `http://127.0.0.1:${port}/probe/index.html?pk=${process.env.STRIPE_PK || ""}`,
    { waitUntil: "domcontentloaded", timeout: 60000 },
  );
  await page.waitForTimeout(1500);
  await page.click("#pop");
  await page.waitForTimeout(20000);
  const r = await page.evaluate(() => window.__probe);
  const frames = page
    .frames()
    .map((f) => f.url().slice(0, 60))
    .filter((u) => u && u !== "about:blank");
  console.log(JSON.stringify({ mode, ...r, frames: frames.length }));
  for (const e of [...new Set(errors)].slice(0, 12))
    console.log("  console/net:", e);
  await ctx.close();
}
await browser.close();

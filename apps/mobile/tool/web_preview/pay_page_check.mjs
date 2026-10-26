// Owner 2026-10-22: the card page for every purchase (subscription, seats,
// Boost) with Apple Pay / Google Pay, under the site's strict CSP (no inline
// scripts). Stripe.js is stubbed; screenshots go to $OUT (default /tmp).
//   node apps/mobile/tool/web_preview/pay_page_check.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
const read = (f) => fs.readFileSync(new URL(`../../web/${f}`, import.meta.url).pathname, 'utf8');
const html = read('pay.html');
const js = read('pay.js');
const out = process.env.OUT || '/tmp';
// The app's policy from infra/modules/web (script part): no 'unsafe-inline'.
const csp = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://js.stripe.com; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'";
const stripeStub = `
window.__calls = [];
window.Stripe = function(){ return {
  elements(opts){ return {
    submit(){ return Promise.resolve({}); },
    create(type, o){ let h={}; let node; o = o || {}; return {
    mount(sel){ node=document.querySelector(sel);
      if (type==='expressCheckout'){ const btn=document.createElement('button'); btn.textContent=' Pay'; btn.className='pay'; btn.style.background='#000'; btn.style.color='#fff'; btn.onclick=()=>h.confirm&&h.confirm({}); node.appendChild(btn); setTimeout(()=>h.ready&&h.ready({availablePaymentMethods:{applePay:true}}),50); window.__calls.push(['ece', opts.mode, JSON.stringify(o.paymentMethods)]); return; }
      const i=document.createElement('input'); i.placeholder=o.placeholder||''; i.style.cssText='width:100%;background:transparent;border:0;color:#fff;font-size:17px;outline:none'; node.appendChild(i); this.i=i;
      i.addEventListener('focus',()=>h.focus&&h.focus()); i.addEventListener('blur',()=>h.blur&&h.blur());
      i.addEventListener('input',()=>{ const v=i.value.replace(/\\D/g,''); let brand='unknown'; if(type==='cardNumber'){ if(v.startsWith('4'))brand='visa'; else if(/^5[1-5]/.test(v))brand='mastercard'; }
        const need={cardNumber:16,cardExpiry:4,cardCvc:3}[type]; h.change&&h.change({complete:v.length>=need,brand,error:null}); }); },
    on(ev,fn){ h[ev]=fn; }, focus(){ this.i&&this.i.focus(); }, clear(){ if(this.i) this.i.value=''; } }; } }; },
  confirmCardSetup(){ window.__calls.push(['confirmCardSetup']); return new Promise(r=>setTimeout(()=>r(window.__decline?{error:{message:'Your card was declined.'}}:{setupIntent:{id:'seti_123456789'}}),300)); },
  confirmCardPayment(){ window.__calls.push(['confirmCardPayment']); return Promise.resolve({paymentIntent:{id:'pi_1',status:'succeeded'}}); },
  confirmSetup(){ window.__calls.push(['confirmSetup']); return Promise.resolve({setupIntent:{id:'seti_w'}}); },
  confirmPayment(){ window.__calls.push(['confirmPayment']); return Promise.resolve({paymentIntent:{id:'pi_w',status:'succeeded'}}); },
  handleNextAction(){ window.__calls.push(['handleNextAction']); return Promise.resolve({paymentIntent:{status:'succeeded'}}); } }; };`;

const sessions = {
  subscription: { kind: 'subscription', mode: 'setup', pageToken: 'page.tok', publishableKey: 'pk_test_x', clientSecret: 'seti_x_secret', setupIntentId: 'seti_x', priceCents: 39900, currency: 'usd', trialDays: 7, trialEligible: true },
  seats: { kind: 'seats', mode: 'setup', pageToken: 'page.tok', publishableKey: 'pk_test_x', clientSecret: 'seti_x_secret', setupIntentId: 'seti_x', priceCents: 2450, currency: 'usd', seats: 3, currentSeats: 1, nextChargeCents: 49700, periodEnd: '2026-11-22T00:00:00.000Z', prorationDate: 1800000000 },
  promotion: { kind: 'promotion', mode: 'payment', pageToken: 'page.tok', publishableKey: 'pk_test_x', clientSecret: 'pi_x_secret', priceCents: 3000, currency: 'usd', days: 3, target: 'post', returnPath: '/promotion' },
  stars: { kind: 'stars', mode: 'payment', pageToken: 'page.tok', publishableKey: 'pk_test_x', clientSecret: 'pi_x_secret', priceCents: 499, currency: 'usd', stars: 100, returnPath: '/stars' },
  client_badge: { kind: 'client_badge', mode: 'setup', pageToken: 'page.tok', publishableKey: 'pk_test_x', clientSecret: 'seti_x_secret', setupIntentId: 'seti_x', priceCents: 1000, currency: 'usd', trialDays: 0, trialEligible: false, returnPath: '/verification' },
};
const confirms = { subscription: { status: 'ok' }, seats: { status: 'requires_action', clientSecret: 'pi_s' }, promotion: { status: 'ok' }, stars: { status: 'ok' }, client_badge: { status: 'pending' } };

const b = await chromium.launch();
let failed = false;
for (const [kind, w, h, theme] of [['subscription', 390, 844, 'day'], ['seats', 390, 844, 'night'], ['promotion', 1280, 900, 'blue'], ['promotion', 390, 844, 'green'], ['stars', 390, 844, 'day'], ['client_badge', 390, 844, 'night']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  p.on('pageerror', (e) => errors.push(String(e)));
  const bodies = [];
  await p.route('**/pay.html*', r => r.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': csp }, body: html }));
  await p.route('**/pay.js', r => r.fulfill({ contentType: 'text/javascript', body: js }));
  await p.route('https://js.stripe.com/v3/', r => r.fulfill({ contentType: 'text/javascript', body: stripeStub }));
  await p.route('**/pay/session', r => { bodies.push(['session', r.request().postDataJSON()]); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: sessions[kind] }) }); });
  await p.route('**/pay/confirm', r => { bodies.push(['confirm', r.request().postDataJSON()]); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: confirms[kind] }) }); });
  await p.goto(`http://localhost:9999/pay.html#t=link.tok&api=${encodeURIComponent('http://localhost:9999/api/v1')}&theme=${theme}&lang=${theme === 'night' ? 'ru' : 'en'}`);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/pay-${kind}-${theme}-a.png`, fullPage: true });
  const walletsShown = await p.evaluate(() => !document.getElementById('wallets').classList.contains('hide'));
  const title = await p.textContent('#plan');
  if (w === 1280 || kind !== 'promotion') {
    // Card path.
    await p.fill('#el-number input', '4242424242424242'); await p.fill('#el-exp input', '1234'); await p.fill('#el-cvc input', '123');
    await p.waitForTimeout(150);
    await p.click('#pay');
  } else {
    // Wallet path (Apple Pay button).
    await p.click('#el-wallets button');
  }
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/pay-${kind}-${theme}-b.png`, fullPage: true });
  const ok = await p.evaluate(() => document.getElementById('ok').classList.contains('show'));
  const calls = await p.evaluate(() => window.__calls.map((c) => c.join(' ')));
  const confirmBody = bodies.find((x) => x[0] === 'confirm')?.[1];
  console.log(kind, theme, w, { title, walletsShown, ok, calls, confirmToken: confirmBody?.token, errors });
  if (!ok || !walletsShown || confirmBody?.token !== 'page.tok' || errors.length) failed = true;
  await ctx.close();
}
await b.close();
if (failed) { console.error('FAILED'); process.exit(1); }
console.log('all good');

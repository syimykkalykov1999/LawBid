import { chromium } from 'playwright';
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../../web/pay.html', import.meta.url).pathname, 'utf8');
const stripeStub = `
window.Stripe = function(){ return {
  elements(){ return { create(type, opts){ let h={}; let node; return {
    mount(sel){ node=document.querySelector(sel); const i=document.createElement('input'); i.placeholder=opts.placeholder||''; i.style.cssText='width:100%;background:transparent;border:0;color:#fff;font-size:17px;outline:none'; node.appendChild(i); this.i=i;
      i.addEventListener('focus',()=>h.focus&&h.focus()); i.addEventListener('blur',()=>h.blur&&h.blur());
      i.addEventListener('input',()=>{ const v=i.value.replace(/\\D/g,''); let brand='unknown'; if(type==='cardNumber'){ if(v.startsWith('4'))brand='visa'; else if(/^5[1-5]/.test(v))brand='mastercard'; }
        const need={cardNumber:16,cardExpiry:4,cardCvc:3}[type]; h.change&&h.change({complete:v.length>=need,brand,error:null}); }); },
    on(ev,fn){ h[ev]=fn; }, focus(){ this.i.focus(); }, clear(){ this.i.value=''; } }; } }; },
  confirmCardSetup(){ return new Promise(r=>setTimeout(()=>r(window.__decline?{error:{message:'Your card was declined.'}}:{setupIntent:{id:'seti_123456789'}}),700)); } }; };`;
const b = await chromium.launch();
for (const [w,h,theme] of [[360,780,'day'],[390,844,'night'],[1280,900,'navy'],[1280,900,'glass']]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } });
  const p = await ctx.newPage();
  await p.route('**/pay.html*', r => r.fulfill({ contentType: 'text/html', body: html }));
  await p.route('https://js.stripe.com/v3/', r => r.fulfill({ contentType: 'text/javascript', body: stripeStub }));
  await p.route('**/pay/session', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { publishableKey: 'pk_test_x', clientSecret: 'seti_x_secret', setupIntentId: 'seti_x', priceCents: 39900, trialDays: 7, trialEligible: true } }) }));
  await p.route('**/pay/confirm', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: { status: 'trialing' } }) }));
  await p.goto(`http://localhost:9999/pay.html#t=abc.def&api=${encodeURIComponent('http://localhost:9999/api/v1')}&theme=${theme}`);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `/tmp/pay-${theme}-${w}-a.png` });
  if (theme === 'day' || theme === 'navy') {
    await p.fill('#el-number input', '4242424242424242'); await p.waitForTimeout(300);
    const brand = await p.textContent('#brandlabel');
    await p.fill('#el-exp input', '1234'); await p.focus('#el-cvc input'); await p.waitForTimeout(900);
    await p.screenshot({ path: `/tmp/pay-${theme}-${w}-b.png` });
    const flipped = await p.evaluate(() => document.getElementById('card').classList.contains('flip'));
    await p.fill('#el-cvc input', '123'); await p.waitForTimeout(200);
    const dis = await p.evaluate(() => document.getElementById('pay').disabled);
    console.log(theme, w, 'brand=', brand, 'flipped=', flipped, 'payDisabled=', dis, 'btn=', await p.textContent('#pay'));
    if (theme === 'day') { await p.evaluate(()=>{window.__decline=true}); await p.click('#pay'); await p.waitForTimeout(1200); await p.screenshot({ path: `/tmp/pay-bad.png` }); console.log('bad shown', await p.evaluate(()=>document.getElementById('bad').classList.contains('show')));
      await p.click('#retry'); await p.waitForTimeout(500); }
    else { await p.click('#pay'); await p.waitForTimeout(1500); await p.screenshot({ path: `/tmp/pay-ok.png` }); console.log('ok shown', await p.evaluate(()=>document.getElementById('ok').classList.contains('show'))); }
  }
  await ctx.close();
}
await b.close();

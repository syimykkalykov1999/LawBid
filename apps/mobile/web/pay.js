/* Owner 2026-10-22 (audit #7): the card page's script, out of pay.html so
   the site's Content-Security-Policy needs no 'unsafe-inline' for scripts. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.hash.slice(1));
  var token = params.get('t') || '';
  var api = (params.get('api') || '').replace(/\/+$/, '');
  var ret = params.get('ret') || '';
  var native = params.get('native') === '1';
  var theme = (params.get('theme') || '').toLowerCase();
  if (!/^(day|night|navy|glass)$/.test(theme)) {
    theme = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'night' : 'day';
  }
  document.documentElement.setAttribute('data-theme', theme);
  // The token stays out of the address bar and the history.
  try { history.replaceState(null, '', location.pathname); } catch (e) {}

  var $ = function (id) { return document.getElementById(id); };
  var T = {
    en: { secure: 'Secure payment · Stripe', loading: 'Preparing your payment…', number: 'Card number', exp: 'Expires', cvc: 'Security code',
      cvchint: 'The 3 or 4 digits on the card.', trial: function (d) { return d + '-day free trial'; },
      after: function (d, a) { return 'Then ' + a + ' per month. You can cancel before the trial ends and pay nothing.'; },
      afterNoTrial: function (a) { return 'You will be charged ' + a + ' today, then every month.'; },
      payTrial: 'Start free trial', pay: function (a) { return 'Pay ' + a; }, processing: 'Processing…',
      fine: 'Cancel anytime in the app → Subscription. Your card details go straight to Stripe and never reach LawBid.',
      back: 'Back to the app', ok: "You're all set", ok2: 'Your subscription is active. Return to the LawBid app.', okBtn: 'Return to LawBid',
      bad: "Payment didn't go through", retry: 'Try another card', expired: 'This link has expired. Open the payment again from the app.',
      generic: 'Something went wrong. Nothing was charged. Please try again.', month: ' / month' },
    ru: { secure: 'Безопасная оплата · Stripe', loading: 'Готовим оплату…', number: 'Номер карты', exp: 'Срок', cvc: 'Код безопасности',
      cvchint: '3 или 4 цифры на карте.', trial: function (d) { return d + ' дней бесплатно'; },
      after: function (d, a) { return 'Затем ' + a + ' в месяц. Можно отменить до конца пробного периода и ничего не платить.'; },
      afterNoTrial: function (a) { return 'Сегодня спишется ' + a + ', дальше каждый месяц.'; },
      payTrial: 'Начать бесплатный период', pay: function (a) { return 'Оплатить ' + a; }, processing: 'Обработка…',
      fine: 'Отмена в любой момент в приложении → Подписка. Данные карты уходят прямо в Stripe и не попадают в LawBid.',
      back: 'Вернуться в приложение', ok: 'Готово', ok2: 'Подписка активна. Вернитесь в приложение LawBid.', okBtn: 'Вернуться в LawBid',
      bad: 'Оплата не прошла', retry: 'Другая карта', expired: 'Ссылка устарела. Откройте оплату заново из приложения.',
      generic: 'Что-то пошло не так. Деньги не списаны. Попробуйте ещё раз.', month: ' / мес' }
  };
  var lang = (params.get('lang') || navigator.language || 'en').slice(0, 2).toLowerCase();
  var L = T[lang] || T.en;
  document.documentElement.lang = T[lang] ? lang : 'en';
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  setText('t-secure', L.secure); setText('t-loading', L.loading); setText('t-number', L.number);
  setText('t-exp', L.exp); setText('t-cvc', L.cvc); setText('t-cvchint', L.cvchint); setText('fine', L.fine);
  setText('cancel', L.back); setText('back-bad', L.back); setText('t-ok', L.ok); setText('t-ok2', L.ok2);
  setText('back-ok', L.okBtn); setText('t-bad', L.bad); setText('retry', L.retry); setText('per', L.month);

  var screens = ['loading', 'form', 'ok', 'bad'];
  function show(name) {
    screens.forEach(function (s) {
      var e = $(s);
      if (s === 'form') { e.style.display = name === s ? 'flex' : 'none'; e.classList.toggle('hide', name !== s); }
      else e.classList.toggle('show', name === s);
    });
  }
  function money(c) { return '$' + (c / 100).toFixed(c % 100 === 0 ? 0 : 2); }
  function call(path, body) {
    return fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }
  function leave(kind) {
    if (!ret) { history.length > 1 ? history.back() : window.close(); return; }
    var path = kind === 'ok' ? '/subscription/success' : '/subscription/cancel';
    if (native) {
      // Opened from the phone app: bring the app itself back (custom scheme,
      // registered on iOS and Android); the web copy only if it did not open.
      location.href = 'lawbid:/' + path;
      setTimeout(function () { if (!document.hidden) location.href = ret + path; }, 1800);
      return;
    }
    location.href = ret + path;
  }
  $('cancel').addEventListener('click', function (e) { e.preventDefault(); leave('no'); });
  $('back-bad').addEventListener('click', function (e) { e.preventDefault(); leave('no'); });
  $('back-ok').addEventListener('click', function () { leave('ok'); });

  var state = { session: null, stripe: null, number: null, exp: null, cvc: null,
    done: { number: false, exp: false, cvc: false }, busy: false, trial: false };

  function label() { state.trial = !!(state.session && state.session.trialEligible && state.session.trialDays > 0); }
  function refreshButton() {
    var ready = state.done.number && state.done.exp && state.done.cvc && !state.busy;
    var btn = $('pay');
    btn.disabled = !ready;
    if (state.busy) { btn.innerHTML = '<span class="spin" style="border-color:rgba(128,128,128,.4);border-top-color:currentColor"></span>' + L.processing; return; }
    btn.textContent = state.trial ? L.payTrial : L.pay(money(state.session.priceCents));
  }
  function brandName(b) {
    return ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay', cartes_bancaires: 'CB' })[b] || '';
  }
  function err(msg) { setText('errors', msg || ''); }

  function mount() {
    var s = state.session;
    state.stripe = window.Stripe(s.publishableKey);
    var els = state.stripe.elements({ locale: lang === 'ru' ? 'ru' : 'en', fonts: [] });
    var style = { base: { color: '#ffffff', fontSize: '17px', fontFamily: 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      letterSpacing: '0.04em', '::placeholder': { color: 'rgba(255,255,255,.55)' }, iconColor: '#ffffff' },
      invalid: { color: '#ffd1ca', iconColor: '#ffd1ca' } };
    state.number = els.create('cardNumber', { style: style, showIcon: false, placeholder: '1234 1234 1234 1234' });
    state.exp = els.create('cardExpiry', { style: style, placeholder: 'MM / YY' });
    state.cvc = els.create('cardCvc', { style: style, placeholder: '•••' });
    state.number.mount('#el-number'); state.exp.mount('#el-exp'); state.cvc.mount('#el-cvc');
    [['number', 'f-number'], ['exp', 'f-exp'], ['cvc', 'f-cvc']].forEach(function (p) {
      var el = state[p[0]], box = $(p[1]);
      el.on('focus', function () { box.classList.add('focus'); $('card').classList.toggle('flip', p[0] === 'cvc'); });
      el.on('blur', function () { box.classList.remove('focus'); if (p[0] === 'cvc') $('card').classList.remove('flip'); });
      el.on('change', function (ev) {
        state.done[p[0]] = !!ev.complete;
        box.classList.toggle('err', !!ev.error);
        err(ev.error ? ev.error.message : '');
        if (p[0] === 'number') {
          setText('brandlabel', brandName(ev.brand));
          // A full number moves on to the date, a full date to the code.
          if (ev.complete) state.exp.focus();
        }
        if (p[0] === 'exp' && ev.complete) state.cvc.focus();
        refreshButton();
      });
    });
    refreshButton();
  }

  function fail(msg) {
    setText('bad-msg', msg || L.generic);
    show('bad');
  }
  $('retry').addEventListener('click', function () {
    state.busy = false;
    ['number', 'exp', 'cvc'].forEach(function (k) { try { state[k].clear(); } catch (e) {} state.done[k] = false; });
    err(''); setText('brandlabel', '');
    show('form'); refreshButton();
    // The old SetupIntent may be used up: a fresh one for the next card.
    load(true);
  });

  $('pay').addEventListener('click', function () {
    if (state.busy || $('pay').disabled) return;
    state.busy = true; refreshButton(); err('');
    state.stripe.confirmCardSetup(state.session.clientSecret, { payment_method: { card: state.number } })
      .then(function (res) {
        if (res.error) { state.busy = false; refreshButton(); fail(res.error.message); return null; }
        return call('/pay/confirm', { token: token, setupIntentId: res.setupIntent.id, chargeNow: !state.trial })
          .then(function (r) {
            state.busy = false;
            if (r.ok) { show('ok'); return; }
            var code = r.body && r.body.error && r.body.error.code;
            if (code === 'SUBSCRIPTION_ALREADY_ACTIVE') { show('ok'); return; }
            refreshButton();
            fail(code === 'UNAUTHORIZED' ? L.expired : (r.body && r.body.error && r.body.error.message));
          });
      })
      .catch(function () { state.busy = false; refreshButton(); fail(L.generic); });
  });

  function paint() {
    var s = state.session;
    label();
    setText('amount', money(s.priceCents));
    var t = $('trial');
    if (state.trial) { t.textContent = L.trial(s.trialDays); t.classList.remove('hide'); setText('after', L.after(s.trialDays, money(s.priceCents))); }
    else { t.classList.add('hide'); setText('after', L.afterNoTrial(money(s.priceCents))); }
  }

  function load(again) {
    if (!token || !api) { show('bad'); setText('bad-msg', L.expired); $('retry').classList.add('hide'); return; }
    call('/pay/session', { token: token }).then(function (r) {
      if (!r.ok) {
        var code = r.body && r.body.error && r.body.error.code;
        $('retry').classList.add('hide');
        fail(code === 'UNAUTHORIZED' ? L.expired : (r.body && r.body.error && r.body.error.message));
        return;
      }
      state.session = r.body.data || r.body;
      paint();
      show('form');
      if (!again) {
        var wait = function () { window.Stripe ? mount() : setTimeout(wait, 80); };
        wait();
      } else { refreshButton(); }
    }).catch(function () { fail(L.generic); });
  }
  load(false);
})();

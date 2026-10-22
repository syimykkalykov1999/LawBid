/* Owner 2026-10-22 (audit #7): the card page's script, out of pay.html so
   the site's Content-Security-Policy needs no 'unsafe-inline' for scripts.
   Owner 2026-10-22 (audit #3): one page for every purchase — the
   subscription (save a card: SetupIntent), assistant seats (price now, the
   saved card or a new one, 3-D Secure) and Boost (pay now: PaymentIntent) —
   with Apple Pay / Google Pay through Stripe's Express Checkout Element. */
(function () {
  'use strict';
  var params = new URLSearchParams(location.hash.slice(1));
  var SAVED = 'lb.pay';
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(SAVED) || 'null'); } catch (e) {}
  // A reload of the open page: the link was used already, its page token
  // (this order only, short-lived) is kept in this tab.
  var token = params.get('t') || (saved && saved.t) || '';
  var api = (params.get('api') || (saved && saved.api) || '').replace(/\/+$/, '');
  var ret = params.get('ret') || (saved && saved.ret) || '';
  var native = (params.get('native') || (saved && saved.native)) === '1';
  var theme = (params.get('theme') || (saved && saved.theme) || '').toLowerCase();
  var langParam = params.get('lang') || (saved && saved.lang) || '';
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
      fineOnce: 'Your card details go straight to Stripe and never reach LawBid.',
      back: 'Back to the app', ok: "You're all set", ok2: 'Your subscription is active. Return to the LawBid app.', okBtn: 'Return to LawBid',
      okSeats: 'The assistant seats are ready. Return to the LawBid app.',
      okBoost: 'Your Boost is paid and starts shortly. Return to the LawBid app.',
      pending: 'The payment is being processed. The app shows it in a moment.',
      bad: "Payment didn't go through", retry: 'Try another card', expired: 'This link has expired. Open the payment again from the app.',
      generic: 'Something went wrong. Nothing was charged. Please try again.', month: ' / month', today: ' today',
      or: 'or pay by card', savedCard: 'Pay with my saved card',
      seatsTitle: function (n) { return n === 1 ? '1 assistant seat' : n + ' assistant seats'; },
      seatsAfter: function (a, d) { return 'Charged now for the rest of this period. From ' + d + ' your bill is ' + a + ' a month.'; },
      boostTitle: function (d) { return 'Boost · ' + d + (d === 1 ? ' day' : ' days'); },
      boostAfter: 'One payment. Your promotion starts once it is paid.' },
    ru: { secure: 'Безопасная оплата · Stripe', loading: 'Готовим оплату…', number: 'Номер карты', exp: 'Срок', cvc: 'Код безопасности',
      cvchint: '3 или 4 цифры на карте.', trial: function (d) { return d + ' дней бесплатно'; },
      after: function (d, a) { return 'Затем ' + a + ' в месяц. Можно отменить до конца пробного периода и ничего не платить.'; },
      afterNoTrial: function (a) { return 'Сегодня спишется ' + a + ', дальше каждый месяц.'; },
      payTrial: 'Начать бесплатный период', pay: function (a) { return 'Оплатить ' + a; }, processing: 'Обработка…',
      fine: 'Отмена в любой момент в приложении → Подписка. Данные карты уходят прямо в Stripe и не попадают в LawBid.',
      fineOnce: 'Данные карты уходят прямо в Stripe и не попадают в LawBid.',
      back: 'Вернуться в приложение', ok: 'Готово', ok2: 'Подписка активна. Вернитесь в приложение LawBid.', okBtn: 'Вернуться в LawBid',
      okSeats: 'Места для помощников готовы. Вернитесь в приложение LawBid.',
      okBoost: 'Продвижение оплачено и скоро начнётся. Вернитесь в приложение LawBid.',
      pending: 'Платёж обрабатывается. Приложение покажет его через минуту.',
      bad: 'Оплата не прошла', retry: 'Другая карта', expired: 'Ссылка устарела. Откройте оплату заново из приложения.',
      generic: 'Что-то пошло не так. Деньги не списаны. Попробуйте ещё раз.', month: ' / мес', today: ' сегодня',
      or: 'или картой', savedCard: 'Оплатить сохранённой картой',
      seatsTitle: function (n) { return 'Мест для помощников: ' + n; },
      seatsAfter: function (a, d) { return 'Сейчас — за остаток периода. С ' + d + ' счёт ' + a + ' в месяц.'; },
      boostTitle: function (d) { return 'Продвижение · дней: ' + d; },
      boostAfter: 'Один платёж. Продвижение начнётся после оплаты.' }
  };
  var lang = (langParam || navigator.language || 'en').slice(0, 2).toLowerCase();
  var L = T[lang] || T.en;
  document.documentElement.lang = T[lang] ? lang : 'en';
  function setText(id, v) { var e = $(id); if (e) e.textContent = v; }
  setText('t-secure', L.secure); setText('t-loading', L.loading); setText('t-number', L.number);
  setText('t-exp', L.exp); setText('t-cvc', L.cvc); setText('t-cvchint', L.cvchint); setText('fine', L.fine);
  setText('cancel', L.back); setText('back-bad', L.back); setText('t-ok', L.ok); setText('t-ok2', L.ok2);
  setText('back-ok', L.okBtn); setText('t-bad', L.bad); setText('retry', L.retry); setText('per', L.month);
  setText('t-or', L.or); setText('saved', L.savedCard);

  var screens = ['loading', 'form', 'ok', 'bad'];
  function show(name) {
    screens.forEach(function (s) {
      var e = $(s);
      if (s === 'form') { e.style.display = name === s ? 'flex' : 'none'; e.classList.toggle('hide', name !== s); }
      else e.classList.toggle('show', name === s);
    });
    if (name === 'ok') { try { sessionStorage.removeItem(SAVED); } catch (e) {} }
  }
  function money(c) { return '$' + (c / 100).toFixed(c % 100 === 0 ? 0 : 2); }
  function call(path, body) {
    return fetch(api + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); });
  }
  function errCode(r) { return r.body && r.body.error && r.body.error.code; }
  function errMsg(r) { return r.body && r.body.error && r.body.error.message; }
  function kind() { return (state.session && state.session.kind) || 'subscription'; }
  function leave(how) {
    if (!ret) { history.length > 1 ? history.back() : window.close(); return; }
    var done = how === 'ok' ? 'success' : 'cancel';
    var path = kind() === 'promotion' ? '/promotion/' + done : '/subscription/' + done;
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

  var state = { session: null, stripe: null, number: null, exp: null, cvc: null, wallets: null,
    done: { number: false, exp: false, cvc: false }, busy: false, trial: false };

  function remember() {
    try {
      sessionStorage.setItem(SAVED, JSON.stringify({ t: token, api: api, ret: ret, native: native ? '1' : '',
        theme: theme, lang: langParam }));
    } catch (e) {}
  }

  function label() {
    var s = state.session;
    state.trial = !!(s && s.kind === 'subscription' && s.trialEligible && s.trialDays > 0);
  }
  function refreshButton() {
    var ready = state.done.number && state.done.exp && state.done.cvc && !state.busy;
    var btn = $('pay');
    btn.disabled = !ready;
    $('saved').disabled = state.busy;
    if (state.busy) { btn.innerHTML = '<span class="spin" style="border-color:rgba(128,128,128,.4);border-top-color:currentColor"></span>' + L.processing; return; }
    btn.textContent = state.trial ? L.payTrial : L.pay(money(state.session.priceCents));
  }
  function brandName(b) {
    return ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover', diners: 'Diners', jcb: 'JCB', unionpay: 'UnionPay', cartes_bancaires: 'CB' })[b] || '';
  }
  function err(msg) { setText('errors', msg || ''); }
  function fail(msg) {
    state.busy = false; refreshButton();
    setText('bad-msg', msg || L.generic);
    show('bad');
  }
  function okScreen() {
    var k = kind();
    setText('t-ok2', k === 'seats' ? L.okSeats : k === 'promotion' ? L.okBoost : L.ok2);
    state.busy = false;
    show('ok');
  }

  // ---- after Stripe ----------------------------------------------------------

  /** The server's answer to /pay/confirm (ok / requires_action / failed / pending). */
  function settle(r) {
    if (!r.ok) {
      var code = errCode(r);
      if (code === 'SUBSCRIPTION_ALREADY_ACTIVE') { okScreen(); return; }
      fail(code === 'UNAUTHORIZED' ? L.expired : errMsg(r));
      return;
    }
    var d = (r.body && r.body.data) || r.body || {};
    if (d.status === 'requires_action' && d.clientSecret) {
      // The bank's check (3-D Secure) for a payment the server made.
      state.stripe.handleNextAction({ clientSecret: d.clientSecret }).then(function (res) {
        if (res.error) { fail(res.error.message); return; }
        var st = res.paymentIntent && res.paymentIntent.status;
        if (st === 'succeeded' || st === 'processing') okScreen(); else fail();
      }, function () { fail(); });
      return;
    }
    if (d.status === 'failed') { fail(); return; }
    if (d.status === 'pending') { setText('t-ok2', L.pending); state.busy = false; show('ok'); return; }
    okScreen();
  }

  /** A card was saved (SetupIntent): the server buys with it. */
  function afterSetup(setupIntentId) {
    var s = state.session;
    var body = { token: token, setupIntentId: setupIntentId };
    if (s.kind === 'subscription') body.chargeNow = !state.trial;
    if (s.kind === 'seats') body.prorationDate = s.prorationDate;
    return call('/pay/confirm', body).then(settle);
  }

  /** A payment was confirmed (PaymentIntent): the server applies it. */
  function afterPayment(paymentIntentId) {
    return call('/pay/confirm', { token: token, paymentIntentId: paymentIntentId }).then(settle);
  }

  // ---- card fields -------------------------------------------------------------

  function mountCard(els) {
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
  }

  /** Apple Pay / Google Pay: shown only where the device offers one. */
  function mountWallets() {
    var s = state.session;
    var opts = s.mode === 'payment'
      ? { mode: 'payment', amount: s.priceCents, currency: s.currency || 'usd', paymentMethodTypes: ['card'] }
      : { mode: 'setup', currency: s.currency || 'usd', paymentMethodTypes: ['card'] };
    opts.locale = lang === 'ru' ? 'ru' : 'en';
    var els;
    try { els = state.stripe.elements(opts); } catch (e) { return; }
    var ece = els.create('expressCheckout', {
      paymentMethods: { applePay: 'auto', googlePay: 'auto', link: 'never', paypal: 'never', amazonPay: 'never', klarna: 'never' },
      buttonHeight: 50,
      buttonTheme: { applePay: theme === 'day' || theme === 'glass' ? 'black' : 'white-outline', googlePay: theme === 'day' || theme === 'glass' ? 'black' : 'white' }
    });
    ece.on('ready', function (ev) {
      var any = ev && ev.availablePaymentMethods && (ev.availablePaymentMethods.applePay || ev.availablePaymentMethods.googlePay);
      $('wallets').classList.toggle('hide', !any);
    });
    ece.on('confirm', function () {
      if (state.busy) return;
      state.busy = true; refreshButton(); err('');
      els.submit().then(function (sub) {
        if (sub.error) { state.busy = false; refreshButton(); err(sub.error.message); return null; }
        var back = location.origin + location.pathname;
        if (s.mode === 'payment') {
          return state.stripe.confirmPayment({ elements: els, clientSecret: s.clientSecret,
            confirmParams: { return_url: back }, redirect: 'if_required' }).then(function (res) {
            if (res.error) { fail(res.error.message); return null; }
            return afterPayment(res.paymentIntent && res.paymentIntent.id);
          });
        }
        return state.stripe.confirmSetup({ elements: els, clientSecret: s.clientSecret,
          confirmParams: { return_url: back }, redirect: 'if_required' }).then(function (res) {
          if (res.error) { fail(res.error.message); return null; }
          return afterSetup(res.setupIntent.id);
        });
      }).catch(function () { fail(); });
    });
    ece.mount('#el-wallets');
    state.wallets = ece;
  }

  function mount() {
    var s = state.session;
    state.stripe = window.Stripe(s.publishableKey);
    mountCard(state.stripe.elements({ locale: lang === 'ru' ? 'ru' : 'en', fonts: [] }));
    mountWallets();
    refreshButton();
  }

  $('retry').addEventListener('click', function () {
    state.busy = false;
    ['number', 'exp', 'cvc'].forEach(function (k) { try { state[k].clear(); } catch (e) {} state.done[k] = false; });
    err(''); setText('brandlabel', '');
    show('form'); refreshButton();
    // The old SetupIntent may be used up: a fresh one for the next card.
    if (kind() !== 'promotion') load(true);
  });

  $('pay').addEventListener('click', function () {
    if (state.busy || $('pay').disabled) return;
    var s = state.session;
    state.busy = true; refreshButton(); err('');
    var card = { payment_method: { card: state.number } };
    var step = s.mode === 'payment'
      ? state.stripe.confirmCardPayment(s.clientSecret, card).then(function (res) {
          if (res.error) { fail(res.error.message); return null; }
          return afterPayment(res.paymentIntent.id);
        })
      : state.stripe.confirmCardSetup(s.clientSecret, card).then(function (res) {
          if (res.error) { fail(res.error.message); return null; }
          return afterSetup(res.setupIntent.id);
        });
    step.catch(function () { fail(); });
  });

  // Seats: the subscription's own card, no new card needed.
  $('saved').addEventListener('click', function () {
    if (state.busy) return;
    state.busy = true; refreshButton(); err('');
    call('/pay/confirm', { token: token, prorationDate: state.session.prorationDate })
      .then(settle).catch(function () { fail(); });
  });

  function paint() {
    var s = state.session;
    label();
    setText('amount', money(s.priceCents));
    var t = $('trial');
    t.classList.add('hide');
    $('saved').classList.toggle('hide', s.kind !== 'seats');
    if (s.kind === 'seats') {
      var when = s.periodEnd ? new Date(s.periodEnd).toLocaleDateString(lang) : '';
      setText('plan', L.seatsTitle(s.seats));
      setText('per', L.today);
      setText('after', L.seatsAfter(money(s.nextChargeCents || 0), when));
      setText('fine', L.fineOnce);
      return;
    }
    if (s.kind === 'promotion') {
      setText('plan', L.boostTitle(s.days));
      setText('per', '');
      setText('after', L.boostAfter);
      setText('fine', L.fineOnce);
      return;
    }
    if (state.trial) { t.textContent = L.trial(s.trialDays); t.classList.remove('hide'); setText('after', L.after(s.trialDays, money(s.priceCents))); }
    else { setText('after', L.afterNoTrial(money(s.priceCents))); }
  }

  function load(again) {
    if (!token || !api) { show('bad'); setText('bad-msg', L.expired); $('retry').classList.add('hide'); return; }
    call('/pay/session', { token: token }).then(function (r) {
      if (!r.ok) {
        $('retry').classList.add('hide');
        fail(errCode(r) === 'UNAUTHORIZED' ? L.expired : errMsg(r));
        return;
      }
      var s = r.body.data || r.body;
      state.session = s;
      // The link is one-time: from now on the page's own token.
      if (s.pageToken) token = s.pageToken;
      remember();
      if (s.mode === 'none') { okScreen(); return; }
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

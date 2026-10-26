/* Owner 2026-10-22 (audit #7): moved out of index.html so the page's
   Content-Security-Policy needs no 'unsafe-inline' for scripts. Runs at the
   end of <body>. */
function hideBoot() {
      var b = document.getElementById('boot');
      if (!b) return;
      b.classList.add('gone');
      setTimeout(function () { b.remove(); }, 400);
    }
    window.addEventListener('flutter-first-frame', hideBoot);

/* Owner 2026-10-23: the passkeys bridge (corbado flutter-passkeys 2.4.0
       bundle.js, sha256 dd06b085…c0be49, BSD-3) is served from our own
       domain, so the page's CSP needs only 'self'. It is added after the
       first frame, only in browsers that have WebAuthn; if it fails the app
       simply has no passkey button (third_party/passkeys_web no longer
       aborts the start). Upgrading passkeys_web means replacing this file. */
    var PASSKEYS_SRC = 'passkeys_bundle.js';
    window.addEventListener('flutter-first-frame', function () {
      if (!window.PublicKeyCredential) return;
      var s = document.createElement('script');
      s.src = PASSKEYS_SRC;
      s.async = true;
      document.head.appendChild(s);
    }, { once: true });

/* Owner 2026-10-24 (slow-link pass): the splash used to say "taking longer
   than usual" at a fixed 12 s, with a Reload button that threw away the
   download still in progress, and hid itself after 90 s (leaving a blank
   page when the app never started). Now:
   - a thin bar under the logo moves while bytes or files arrive
     (window.__lbBoot, boot_head.js; the loader itself has no progress
     event) and stands still when they stop;
   - the message and the button appear only when nothing has arrived for
     15 s (40 s while the JavaScript app, which the browser loads as a
     script and reports only when finished, is still coming), or when one of
     the app's files failed for good; they go away again if the download
     resumes. «Обновить» is therefore a reload of a download that is really
     stuck, never of one that is progressing;
   - the splash never disappears by itself. */
(function () {
  var B = window.__lbBoot || { last: Date.now(), jsPending: false, failed: false };
  var QUIET = 15000, QUIET_JS = 40000;
  var t0 = Date.now();
  var boot = document.getElementById('boot');
  if (!boot) return;
  var ru = /^ru/i.test(navigator.language || '');
  var bar = document.createElement('s');
  bar.setAttribute('aria-hidden', 'true');
  boot.appendChild(bar);
  var msg = null, btn = null;

  function jsDone() {
    if (!B.jsPending) return true;
    try {
      var r = performance.getEntriesByType('resource');
      for (var i = 0; i < r.length; i++) if (/\/main\.dart\.js$/.test(r[i].name)) return true;
    } catch (e) { return true; }
    return false;
  }
  function show() {
    boot.classList.add('stalled');
    if (msg) return;
    msg = document.createElement('p');
    msg.textContent = ru ? 'Загрузка идёт дольше обычного. Проверьте соединение.' : 'Taking longer than usual. Check your connection.';
    btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = ru ? 'Обновить' : 'Reload';
    btn.onclick = function () { location.reload(); };
    boot.appendChild(msg);
    boot.appendChild(btn);
  }
  function hide() {
    boot.classList.remove('stalled');
    if (!msg) return;
    msg.remove();
    btn.remove();
    msg = btn = null;
  }
  var timer = setInterval(function () {
    var b = document.getElementById('boot');
    if (!b || b.classList.contains('gone')) { clearInterval(timer); return; }
    var quiet = Date.now() - Math.max(B.last || 0, t0);
    if (B.failed || quiet > (jsDone() ? QUIET : QUIET_JS)) show(); else hide();
  }, 1000);
})();

/* Owner 2026-10-20: a link or QR code for the app (profile, group, case,
       post...) opened in a phone's browser because the app is not installed
       (or the phone did not hand the link over): offer "Open in LawBid" —
       the app when it is there, the store when it is not. Phones only; the
       bar can be closed. (Add <meta name="apple-itunes-app"
       content="app-id=<App Store id>"> in <head> once the App Store id of
       the listing exists: iOS Safari then shows its own banner too.) */
    (function () {
      var m = location.pathname.match(/^\/(u|g|case|lawyer|post|r|q)\/([^\/]+)/);
      var ua = navigator.userAgent || '';
      var android = /Android/i.test(ua);
      var ios = /iPhone|iPad|iPod/i.test(ua);
      if (!m || !(android || ios)) return;
      try { if (sessionStorage.getItem('openAppClosed')) return; } catch (e) {}
      var ru = /^ru/i.test(navigator.language || '');
      var label = ru ? 'Открыть в LawBid' : 'Open in LawBid';
      var close = ru ? 'Закрыть' : 'Close';
      var play = 'https://play.google.com/store/apps/details?id=com.lawbid.lawbid';
      var href = android
        ? 'intent://lawbid.dev' + location.pathname + '#Intent;scheme=https;package=com.lawbid.lawbid;S.browser_fallback_url=' + encodeURIComponent(play) + ';end'
        : 'lawbid://' + m[1] + '/' + m[2];
      var bar = document.createElement('div');
      bar.setAttribute('role', 'region');
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:calc(env(safe-area-inset-top) + 6px) 12px 6px;background:#0A1A3C;color:#fff;font:600 14px/1.2 -apple-system,Roboto,sans-serif;box-shadow:0 1px 6px rgba(0,0,0,.35)';
      var a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      a.style.cssText = 'flex:1;color:#fff;text-decoration:none;padding:8px 0';
      var x = document.createElement('button');
      x.type = 'button';
      x.setAttribute('aria-label', close);
      x.textContent = '\u2715';
      x.style.cssText = 'border:0;background:none;color:#fff;font-size:18px;min-width:44px;min-height:44px';
      x.onclick = function () {
        try { sessionStorage.setItem('openAppClosed', '1'); } catch (e) {}
        bar.remove();
      };
      bar.appendChild(a);
      bar.appendChild(x);
      document.body.appendChild(bar);
    })();

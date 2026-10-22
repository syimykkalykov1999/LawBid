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
    setTimeout(hideBoot, 30000); // never stays if the event does not come

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

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

/* D1-49 (13.11): the visually hidden <main id="seo"> (landing heading and
   links for search engines) must not be read by a screen reader or reached
   with Tab on every app screen once the app is drawn. It stays in the page
   for crawlers; aria-hidden + inert take it out of the accessibility tree
   and the focus order. */
function hideSeo() {
      var s = document.getElementById('seo');
      if (!s) return;
      s.setAttribute('aria-hidden', 'true');
      s.setAttribute('inert', '');
    }
    window.addEventListener('flutter-first-frame', hideSeo, { once: true });

/* Owner 2026-10-23: the passkeys bridge (corbado flutter-passkeys 2.5.0
       bundle.js, the release passkeys_web 2.7+ is built for (D1, 13.11),
       sha256 56a7525e…a31919, BSD-3) is served from our own
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

/* Owner 2026-10-26: the splash is the logo only again (look frozen): the
   2026-10-24 progress bar and the "taking longer than usual / Reload" text
   were removed. The resumable download in boot_head.js stays (no look). */

/* Owner 2026-10-20: a link or QR code for the app (profile, group, case,
       post...) opened in a phone's browser because the app is not installed
       (or the phone did not hand the link over): offer "Open in LawBid" —
       the app when it is there, the store when it is not. Phones only; the
       bar can be closed.
   Pack F (25.11, ROUND5 F7): the proven smart-banner pattern of each
       platform, no dead ends while the app is not in the stores:
       - iOS: Apple's own Smart App Banner (<meta name="apple-itunes-app"
         content="app-id=..., app-argument=<this url>">, developer.apple.com
         "Promoting apps with Smart App Banners"): Safari itself opens the
         app when it is installed and the App Store when it is not. Our own
         bar is never shown on iOS: a lawbid:// link there makes Safari say
         "the address is invalid" when the app is missing. Until the App
         Store id below is filled in, iOS shows nothing.
       - Android: Chrome's intent:// link (developer.chrome.com "Android
         Intents with Chrome"): the app when it is installed, otherwise
         S.browser_fallback_url, which is the Play listing once the app is
         in Play and this very page until then (never a Play page that does
         not exist yet).
       Paths: the app-link paths the phones open (AASA, AndroidManifest),
       now with /c/ and /attorneys/. */
    (function () {
      /* Fill in when the store listings are live. */
      var APP_STORE_ID = '';
      var PLAY_LISTED = false;
      var m = location.pathname.match(/^\/(u|g|c|case|lawyer|attorneys|post|r|q)\/([^\/]+)/);
      var ua = navigator.userAgent || '';
      var android = /Android/i.test(ua);
      var ios = /iPhone|iPad|iPod/i.test(ua);
      if (!m || !(android || ios)) return;
      if (ios) {
        if (!APP_STORE_ID || document.querySelector('meta[name="apple-itunes-app"]')) return;
        var meta = document.createElement('meta');
        meta.name = 'apple-itunes-app';
        meta.content = 'app-id=' + APP_STORE_ID + ', app-argument=' + location.href;
        document.head.appendChild(meta);
        return;
      }
      try { if (sessionStorage.getItem('openAppClosed')) return; } catch (e) {}
      var ru = /^ru/i.test(navigator.language || '');
      var label = ru ? 'Открыть в LawBid' : 'Open in LawBid';
      var close = ru ? 'Закрыть' : 'Close';
      var fallback = PLAY_LISTED
        ? 'https://play.google.com/store/apps/details?id=com.lawbid.lawbid'
        : location.href;
      var href = 'intent://' + location.host + location.pathname + location.search +
        '#Intent;scheme=https;package=com.lawbid.lawbid;S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end';
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

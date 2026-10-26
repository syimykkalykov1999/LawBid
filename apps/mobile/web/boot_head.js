/* Owner 2026-10-22 (audit #7): moved out of index.html so the page's
   Content-Security-Policy needs no 'unsafe-inline' for scripts. Runs in
   <head>, before the engine. */
/* Owner 2026-10-18 (iPhone): Flutter replaces this tag with one that
       allows zoom up to 5x, and its hidden text fields are 14px, so iOS
       Safari zoomed into the page on every tap in a field and half the
       screen went off the edge. Keep our tag: no automatic zoom (pinch still
       works on iOS), and the notch area is ours (viewport-fit=cover). */
    (function () {
      var want = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover';
      function fix() {
        var tags = document.querySelectorAll('meta[name="viewport"]');
        for (var i = 0; i < tags.length; i++) {
          if (tags[i].getAttribute('content') !== want) tags[i].setAttribute('content', want);
        }
      }
      new MutationObserver(fix).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
      /* After the keyboard closes iOS can leave the page shifted up. */
      document.addEventListener('focusout', function () {
        setTimeout(function () { if (window.scrollY || window.scrollX) window.scrollTo(0, 0); }, 60);
      });
    })();

/* Owner 2026-10-24 (slow-link pass): the app's download, started while the
   browser is still reading the page, and watched.

   Which files? The same ones flutter.js will pick (it decides by browser
   engine: only Chrome / Edge / Opera run the WebAssembly build; Safari and
   Firefox always run the JavaScript build). Before this change the hints
   below were chosen by "has WasmGC", so Safari and Firefox pre-downloaded
   the WebAssembly app (3.7 MB) and its engine (2.3 MB) for nothing, then
   downloaded the JavaScript app and CanvasKit on top: twice the bytes on
   the same slow link.

   The big .wasm files are downloaded by this script (not by <link
   rel=preload>): it counts the bytes (the loader has no progress event), and
   when the connection drops half way it fetches the file again and silently
   skips what the loader already got, instead of leaving the splash for
   ever. The loader's own fetch() of the same address is handed this
   download (a single download, still streamed into the compiler).

   The deploy (scripts/deploy/web-immutable.py) fills in the folder that holds
   the app; a local build leaves the placeholder and nothing is pre-started.
   window.__lbBoot is read by boot_end.js (splash, stall detection). */
(function () {
  var V = '__LB_V__';
  var B = window.__lbBoot = { last: Date.now(), bytes: 0, retries: 0, early: 0, jsPending: false, failed: false };
  function touch(n) { B.bytes += n; B.last = Date.now(); }
  try {
    /* Every finished file counts as a sign of life. */
    new PerformanceObserver(function () { B.last = Date.now(); }).observe({ entryTypes: ['resource'] });
  } catch (e) { /* no observer: bytes alone */ }
  /* A load error of the app's own files is final: say so at once. */
  window.addEventListener('error', function (ev) {
    var t = ev && ev.target;
    if (t && t.tagName === 'SCRIPT' && /main\.dart|canvaskit|skwasm/.test(t.src || '')) B.failed = true;
  }, true);

  var origFetch = window.fetch;
  var early = {};
  function abs(u) { try { return new URL(typeof u === 'string' ? u : u.url, document.baseURI).href; } catch (e) { return ''; } }

  /* A streamed download that survives a dropped connection: starts again
     from the first byte and skips what was already handed over. */
  function resilient(url, mime) {
    var delivered = 0, skip = 0, tries = 0, reader = null;
    function open() {
      return origFetch.call(window, url, { credentials: 'same-origin' }).then(function (r) {
        if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
        reader = r.body.getReader();
        skip = delivered;
      });
    }
    function retry(e) {
      if (++tries > 6) return Promise.reject(e);
      B.retries++;
      return new Promise(function (ok) { setTimeout(ok, 500 * tries); }).then(open).catch(retry);
    }
    function next(ctrl) {
      return reader.read().then(function (x) {
        if (x.done) { ctrl.close(); return; }
        var v = x.value;
        touch(v.length);
        if (skip) {
          if (v.length <= skip) { skip -= v.length; return next(ctrl); }
          v = v.subarray(skip);
          skip = 0;
        }
        delivered += v.length;
        ctrl.enqueue(v);
      }, function (e) {
        return retry(e).then(function () { return next(ctrl); });
      });
    }
    return open().catch(retry).then(function () {
      var stream = new ReadableStream({
        pull: function (ctrl) { return next(ctrl).catch(function (e) { ctrl.error(e); }); },
        cancel: function () { try { reader.cancel(); } catch (e) { /* closed */ } }
      });
      return new Response(stream, { status: 200, headers: { 'content-type': mime } });
    });
  }

  /* The page's own fetches: a request that fails before any answer (a
     dropped connection, a reset) is repeated a few times, and the early
     downloads above are handed to whoever asks for them first. */
  window.fetch = function (input, init) {
    var url = abs(input);
    if (url && early[url]) { var p = early[url]; delete early[url]; B.early++; return p; }
    var go = function (n) {
      return origFetch.call(window, input, init).catch(function (e) {
        if (n >= 3 || (init && init.signal) || url.indexOf(location.origin + '/v/') !== 0) throw e;
        B.retries++;
        return new Promise(function (ok) { setTimeout(ok, 400 * (n + 1)); }).then(function () { return go(n + 1); });
      });
    };
    return go(0);
  };

  if (V.indexOf('__') === 0) return;
  var ua = navigator.userAgent || '';
  var blink = navigator.vendor === 'Google Inc.' || ua.indexOf('Edg/') !== -1;
  var gc = false;
  try {
    // A tiny module with a GC struct type: valid only with WasmGC.
    gc = WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0]));
  } catch (e) { /* no WebAssembly */ }
  function add(rel, href, as, cors) {
    var l = document.createElement('link');
    l.rel = rel;
    l.href = V + '/' + href;
    if (as) l.as = as;
    if (cors) l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
  function start(href, mime) {
    var url = abs(V + '/' + href);
    try {
      early[url] = resilient(url, mime);
      early[url].catch(function () { delete early[url]; B.failed = true; });
    } catch (e) { delete early[url]; add('preload', href, 'fetch', true); }
  }
  if (blink && gc) {
    /* WebAssembly build, CanvasKit-less engine. */
    add('modulepreload', 'main.dart.mjs');
    add('modulepreload', 'canvaskit/skwasm.js');
    start('main.dart.wasm', 'application/wasm');
    start('canvaskit/skwasm.wasm', 'application/wasm');
  } else if (!blink) {
    /* JavaScript build + CanvasKit (Safari, Firefox, others). */
    B.jsPending = true;
    add('preload', 'main.dart.js', 'script');
    add('preload', 'canvaskit/canvaskit.js', 'script');
    start('canvaskit/canvaskit.wasm', 'application/wasm');
  }
})();

/* Owner 2026-10-23: a person who picked the Blue or Green theme sees that
   colour from the first paint (the app's own theme tokens: AppColorsBlue /
   AppColorsGreen), not a white or black flash. shared_preferences keeps the
   choice in localStorage as a JSON string under "flutter.<key>". */
(function () {
  var themes = {
    blue: { bg: '#003B70', fg: '#FFFFFF', dim: '#C3D8EE', ring: '#FFFFFF', track: '#2F6AA3', btn: '#003B70' },
    green: { bg: '#007200', fg: '#FFFFFF', dim: '#E2F4E2', ring: '#FFFFFF', track: '#3CAE3C', btn: '#006000' }
  };
  try {
    var raw = window.localStorage.getItem('flutter.design_system.theme_mode');
    var t = themes[raw ? JSON.parse(raw) : null];
    if (!t) return;
    var s = document.documentElement.style;
    s.setProperty('--boot-bg', t.bg);
    s.setProperty('--boot-fg', t.fg);
    s.setProperty('--boot-dim', t.dim);
    s.setProperty('--boot-ring', t.ring);
    s.setProperty('--boot-track', t.track);
    s.setProperty('--boot-btn', t.btn);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) metas[i].setAttribute('content', t.bg);
  } catch (e) { /* no storage: the default colours stay */ }
})();

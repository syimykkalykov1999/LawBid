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

/* Owner 2026-10-23 (web speed pass): start the app's download while the
   browser is still reading the page. Without this the app (3 MB
   compressed) starts only after flutter_bootstrap.js ran and asked for it.
   The deploy (scripts/deploy/web-immutable.py) fills in the folder that
   holds the app; a local build leaves the placeholder and nothing is
   preloaded. Only for browsers that run the WebAssembly build (WasmGC);
   the others get the JS build, which the loader picks by itself. */
(function () {
  var V = '__LB_V__';
  if (V.indexOf('__') === 0) return;
  try {
    // A tiny module with a GC struct type: valid only with WasmGC.
    if (!WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0]))) return;
  } catch (e) { return; }
  function add(rel, href, as, cors) {
    var l = document.createElement('link');
    l.rel = rel;
    l.href = V + '/' + href;
    if (as) l.as = as;
    if (cors) l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
  add('modulepreload', 'main.dart.mjs');
  add('preload', 'main.dart.wasm', 'fetch', true);
  /* The engine: Chrome-like browsers get skwasm, Safari / Firefox the
     bigger skwasm_heavy (flutter.js picks by the same test). */
  var engine = window.chrome ? 'skwasm' : 'skwasm_heavy';
  add('modulepreload', 'canvaskit/' + engine + '.js');
  add('preload', 'canvaskit/' + engine + '.wasm', 'fetch', true);
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

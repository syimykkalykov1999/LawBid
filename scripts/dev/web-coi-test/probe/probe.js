var R = window.__probe = { isolated: window.crossOriginIsolated, sab: typeof SharedArrayBuffer === 'function' };
var O = 'http://127.0.0.1:8179';
function el(tag, src, ev, key) {
  var e = document.createElement(tag); e.muted = true; e.preload = 'auto';
  e.addEventListener(ev, function () { R[key] = 'ok'; });
  e.addEventListener('error', function () { R[key] = 'blocked'; });
  e.src = src; document.body.appendChild(e);
}
el('img', O + '/img.png', 'load', 'img_nocors_nocorp');
el('img', O + '/img.png?corp', 'load', 'img_nocors_corp');
el('video', O + '/clip.webm', 'canplay', 'video_nocors_nocorp');
el('video', O + '/clip.webm?corp', 'canplay', 'video_nocors_corp');
el('audio', O + '/voice.wav', 'canplay', 'audio_nocors_nocorp');
fetch(O + '/img.png?cors', { mode: 'cors' }).then(function (r) { R.fetch_cors = r.ok ? 'ok' : 'http' + r.status; }, function () { R.fetch_cors = 'blocked'; });
document.fonts.ready.then(function () { R.font_css = [].some.call(document.styleSheets, function (s) { return /fonts.googleapis/.test(s.href || ''); }) ? 'ok' : 'missing'; });
try {
  turnstile.render('#ts', { sitekey: '1x00000000000000000000AA', callback: function () { R.turnstile = 'ok'; }, 'error-callback': function (c) { R.turnstile = 'error ' + c; } });
} catch (e) { R.turnstile = 'no script: ' + e; }
try {
  var card = Stripe(new URLSearchParams(location.search).get('pk') || '').elements().create('card');
  card.on('ready', function () { R.stripe_card = 'ok'; });
  card.mount('#card');
} catch (e) { R.stripe_card = 'no script: ' + e; }
window.addEventListener('message', function (m) { if (m.data && m.data.signedIn) R.popup_message = 'ok'; });
document.getElementById('pop').addEventListener('click', function () {
  var w = window.open(O + '/popup.html', 'signin', 'width=400,height=400');
  R.popup_handle = w ? 'window' : 'null';
  setTimeout(function () { try { R.popup_closed_seen = w && w.closed; } catch (e) { R.popup_closed_seen = 'err'; } }, 1500);
});

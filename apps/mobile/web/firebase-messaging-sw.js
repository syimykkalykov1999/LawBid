// Owner 2026-10-15 (web push). Shows a notification when the site is not
// open. The Firebase keys below are filled in at deploy time
// (.github/workflows/web-deploy.yml). Owner 2026-11-02: the keys may instead
// live in the admin (Integrations → FCM) and reach only the page, so while
// these are placeholders the worker shows pushes itself, with no Firebase SDK
// and no keys (the FCM payload is read as plain Web Push).
/* global firebase, importScripts, self, clients */
const config = {
  apiKey: '__FIREBASE_WEB_API_KEY__',
  appId: '__FIREBASE_WEB_APP_ID__',
  messagingSenderId: '__FIREBASE_WEB_SENDER_ID__',
  projectId: '__FIREBASE_WEB_PROJECT_ID__',
};

const FALLBACK_TAG = 'lawbid-background';

// Chrome allows a push without a notification only while a page of the site
// is visible (userVisibleOnly). A push the app handles silently (a call that
// ended, a sync, a badge) shows a notification and closes it at once, or
// Chrome shows its own «site updated in the background» and may revoke the
// permission.
function showSilently() {
  return self.registration
    .showNotification('LawBid', { tag: FALLBACK_TAG, silent: true })
    .then(() => self.registration.getNotifications({ tag: FALLBACK_TAG }))
    .then((list) => list.forEach((n) => n.close()));
}

// Where a tap goes: a link of the site from the payload (fcmOptions.link,
// data.link / data.url). Anything outside the site is ignored.
function siteLink(raw) {
  if (!raw) return null;
  try {
    const u = new URL(raw, self.location.origin);
    return u.origin === self.location.origin ? u.href : null;
  } catch (_) {
    return null;
  }
}

function showFor(payload) {
  const n = payload.notification || {};
  const data = payload.data || {};
  const title = n.title || data.title;
  if (!title) return showSilently();
  const link = (payload.fcmOptions && payload.fcmOptions.link) || data.link || data.url || '';
  return self.registration.showNotification(title, {
    body: n.body || data.body || '',
    data: { ...data, link },
    tag: data.callId || undefined,
    requireInteraction: data.type === 'incoming_call',
  });
}

// D1-23: the same Firebase JS SDK as the page (Firebase's rule for the
// messaging worker): firebase_core_web's `supportedFirebaseJsSdkVersion` in
// pubspec.lock. scripts/ci/web-assets-match-lock.sh fails when they differ.
const FIREBASE_JS_VERSION = '13.1.0';

if (!config.apiKey.startsWith('__')) {
  importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-app-compat.js`);
  importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_JS_VERSION}/firebase-messaging-compat.js`);
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  // A message with a `notification` is shown by the browser itself. A
  // data-only one (an incoming call) is shown here. (The SDK hands a message
  // to an open, visible page itself.)
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    // Data-only without a title stays silent here, as before.
    if (!(payload.data && payload.data.title)) return;
    return showFor(payload);
  });
} else {
  // Keyless path: the browser delivers the FCM payload as a Web Push event,
  // and this worker does what the SDK's worker does.
  self.addEventListener('push', (event) => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch (_) {
      event.waitUntil(showSilently());
      return;
    }
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        if (list.some((c) => c.visibilityState === 'visible')) {
          // The open page shows it in the app. Every page gets the message
          // exactly as the SDK's worker hands it over (sendMessagePayload-
          // InternalToWindows in firebase-js-sdk messaging), so `onMessage`
          // fires there (calls, call end, reminders, badges, sync).
          const message = { ...payload, messageType: 'push-received', isFirebaseMessaging: true };
          list.forEach((c) => c.postMessage(message));
          return;
        }
        return showFor(payload);
      }),
    );
  });
}

self.addEventListener('notificationclick', (event) => {
  // The SDK handles the notifications it showed itself.
  if (event.notification.data && event.notification.data.FCM_MSG) return;
  event.notification.close();
  const link = siteLink((event.notification.data || {}).link);
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (link && 'navigate' in c) {
          // A page this worker does not control refuses navigate(): focus it.
          return c
            .navigate(link)
            .then((moved) => (moved || c).focus())
            .catch(() => c.focus());
        }
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow(link || '/');
    }),
  );
});

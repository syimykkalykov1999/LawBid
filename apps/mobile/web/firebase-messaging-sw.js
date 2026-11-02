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

if (!config.apiKey.startsWith('__')) {
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  // A message with a `notification` is shown by the browser itself. A
  // data-only one (an incoming call) is shown here.
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return;
    const data = payload.data || {};
    if (!data.title) return;
    return self.registration.showNotification(data.title, {
      body: data.body || '',
      data,
      tag: data.callId || data.type || 'lawbid',
      requireInteraction: data.type === 'incoming_call',
    });
  });

} else {
  // Keyless path: the browser delivers the FCM payload as a Web Push event.
  self.addEventListener('push', (event) => {
    let payload = {};
    try {
      payload = event.data ? event.data.json() : {};
    } catch (_) {
      return;
    }
    const n = payload.notification || {};
    const data = payload.data || {};
    const title = n.title || data.title;
    if (!title) return;
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
        // The open, visible page already shows it in the app.
        if (list.some((c) => c.visibilityState === 'visible')) return;
        return self.registration.showNotification(title, {
          body: n.body || data.body || '',
          data,
          tag: data.callId || data.type || 'lawbid',
          requireInteraction: data.type === 'incoming_call',
        });
      }),
    );
  });

}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    }),
  );
});

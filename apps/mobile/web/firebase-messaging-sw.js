// Owner 2026-10-15 (web push). Shows a notification when the site is not
// open. The Firebase keys below are filled in at deploy time
// (.github/workflows/web-deploy.yml); while they are placeholders this
// worker does nothing.
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
}

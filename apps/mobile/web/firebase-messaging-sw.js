// Browser notifications while the LawBid tab is closed or in the
// background (push_service.dart registers the token). The Firebase "Web
// app" config is written to firebase-config.js by tool/web_assets.sh from
// the build's FIREBASE_WEB_* values; without it this worker does nothing.
importScripts('firebase-config.js');
if (self.LAWBID_FIREBASE) {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js',
  );
  firebase.initializeApp(self.LAWBID_FIREBASE);
  // The server sends a `webpush.notification` (fcm-push.sender.ts), which
  // the SDK shows by itself; this only opens the app on a tap.
  firebase.messaging();
}
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});

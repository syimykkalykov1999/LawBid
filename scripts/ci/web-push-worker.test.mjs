// The keyless Web Push worker (apps/mobile/web/firebase-messaging-sw.js):
// what it does with a push while a page is visible, hidden or absent, and
// where a tap goes. Runs the real file against a fake service-worker scope.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const SRC = fs.readFileSync(
  path.resolve(import.meta.dirname, '../../apps/mobile/web/firebase-messaging-sw.js'),
  'utf8',
);

function load(windows = []) {
  const handlers = {};
  const shown = [];
  const closed = [];
  const opened = [];
  const self = {
    location: { origin: 'https://lawbid.dev' },
    addEventListener: (type, fn) => (handlers[type] = fn),
    registration: {
      showNotification: async (title, opts) => shown.push({ title, ...opts }),
      getNotifications: async ({ tag }) => [{ tag, close: () => closed.push(tag) }],
    },
  };
  const clients = {
    matchAll: async () => windows,
    openWindow: async (url) => opened.push(url),
  };
  vm.runInNewContext(SRC, { self, clients, URL, importScripts() {} });
  const push = async (payload) => {
    let waited;
    const json = () => {
      if (payload instanceof Error) throw payload;
      return payload;
    };
    await handlers.push({ data: { json }, waitUntil: (p) => (waited = p) });
    await waited;
  };
  const click = async (notification) => {
    let waited;
    handlers.notificationclick({ notification, waitUntil: (p) => (waited = p) });
    await waited;
  };
  return { push, click, shown, closed, opened };
}

const page = (visibility) => {
  const sent = [];
  return {
    visibilityState: visibility,
    postMessage: (m) => sent.push(m),
    focus: async () => 'focused',
    navigate: async function (url) { this.url = url; return this; },
    sent,
  };
};

test('a visible page gets the message, no notification', async () => {
  const w = page('visible');
  const t = load([w]);
  await t.push({ data: { type: 'incoming_call', callId: 'c1', title: 'Call' } });
  assert.equal(t.shown.length, 0);
  assert.equal(w.sent[0].isFirebaseMessaging, true);
  assert.equal(w.sent[0].messageType, 'push-received');
  assert.equal(w.sent[0].data.callId, 'c1');
});

test('no visible page: the notification is shown with its link', async () => {
  const t = load([page('hidden')]);
  await t.push({
    notification: { title: 'New message', body: 'Hi' },
    data: { type: 'chat' },
    fcmOptions: { link: '/chats/42' },
  });
  assert.equal(t.shown[0].title, 'New message');
  assert.equal(t.shown[0].data.link, '/chats/42');
});

test('a data-only push without a title never goes unanswered', async () => {
  const t = load([]);
  await t.push({ data: { type: 'call_ended', callId: 'c1' } });
  assert.equal(t.shown.length, 1);
  assert.equal(t.shown[0].silent, true);
  assert.deepEqual(t.closed, ['lawbid-background']);
});

test('an unreadable payload never goes unanswered either', async () => {
  const t = load([]);
  await t.push(new Error('bad json'));
  assert.equal(t.shown.length, 1);
  assert.deepEqual(t.closed, ['lawbid-background']);
});

test('a tap opens the payload link of the site, not another site', async () => {
  const t = load([]);
  await t.click({ close() {}, data: { link: '/chats/42' } });
  await t.click({ close() {}, data: { link: 'https://evil.example/x' } });
  await t.click({ close() {}, data: {} });
  assert.deepEqual(t.opened, ['https://lawbid.dev/chats/42', '/', '/']);
});

test('a tap navigates an open page to the link', async () => {
  const w = page('hidden');
  const t = load([w]);
  await t.click({ close() {}, data: { link: '/chats/42' } });
  assert.equal(w.url, 'https://lawbid.dev/chats/42');
});

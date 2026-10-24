// Realtime scenarios (Socket.IO, see lib/socketio.js) and the call
// signalling flow (REST + sockets).
import { Trend, Rate, Counter } from 'k6/metrics';
import { sleep } from 'k6';
import { openSocket } from './socketio.js';
import { post, json } from './http.js';
import { conversation, rnd } from './data.js';

const HOLD_S = Number(__ENV.WS_HOLD_SECONDS || 300);
export const chatDeliveryMs = new Trend('chat_delivery_ms', true);
export const chatDelivered = new Rate('chat_delivered');
export const joinOk = new Rate('room_join_ok');
export const callRingMs = new Trend('call_ring_ms', true);
export const callAcceptMs = new Trend('call_accept_ms', true);
export const callSignalMs = new Trend('call_signal_ms', true);
export const callEndMs = new Trend('call_end_ms', true);
export const callOk = new Rate('call_flow_ok');
export const callBusy = new Counter('call_busy');

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

// Held connection: joins its chat room, receives events and, every ~25 s,
// the other member sends a message through REST; the time until the event
// reaches this socket is chat_delivery_ms (the full REST -> DB -> Redis
// adapter -> other task -> socket path).
export function holdSocket() {
  const c = conversation(rnd);
  if (!c) return sleep(5);
  const pending = {};
  let timer = null;
  const sock = openSocket(c.ct, {
    onReady(s) {
      s.emit('conversation:join', { conversationId: c.id }, (ack) => joinOk.add(!!(ack && ack.ok)));
      const tick = () => {
        const marker = `ld${Date.now()}${Math.floor(Math.random() * 1e6)}`;
        pending[marker] = Date.now();
        post(`/conversations/${c.id}/messages`, { clientMessageId: uuid(), body: marker }, c.at, 'chat_send_ws');
        timer = setTimeout(tick, 20000 + Math.random() * 10000);
      };
      timer = setTimeout(tick, 5000 + Math.random() * 20000);
    },
    onEvent(name, frame) {
      if (name !== 'message:new') return;
      for (const m in pending) {
        if (frame.indexOf(m) !== -1) {
          chatDeliveryMs.add(Date.now() - pending[m]);
          chatDelivered.add(true);
          delete pending[m];
        }
      }
    },
    onClose() {
      if (timer) clearTimeout(timer);
      for (const m in pending) chatDelivered.add(false);
    },
  });
  setTimeout(() => sock.close(), HOLD_S * 1000);
}

// Reconnect storm: a connection that lives 10-20 s and is replaced at once.
export function stormSocket() {
  const c = conversation(rnd);
  if (!c) return sleep(1);
  const sock = openSocket(c.ct, {
    onReady(s) {
      s.emit('conversation:join', { conversationId: c.id }, (ack) => joinOk.add(!!(ack && ack.ok)));
    },
  });
  setTimeout(() => sock.close(), 10000 + Math.random() * 10000);
}

const SDP = 'v=0\r\no=- 46117317 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' + 'a=candidate:1 1 udp 2113937151 10.0.0.1 54400 typ host\r\n'.repeat(20);

// Call start / accept / signal / end through the API and the realtime layer.
// attorney = caller (sockets of both members are open), client = callee.
export function callFlow() {
  const c = conversation(rnd);
  if (!c) return sleep(1);
  const t = { start: 0, incoming: 0, accepted: 0 };
  let callId = null;
  let done = false;
  let signals = 0;
  let sa = null;
  let sc = null;
  const finish = (ok) => {
    if (done) return;
    done = true;
    callOk.add(ok);
    if (callId && !ok) post(`/calls/${callId}/end`, { reason: 'failed' }, c.at, 'call_end', undefined, [404, 409]);
    if (sa) sa.close();
    if (sc) sc.close();
  };
  let ready = 0;
  const go = () => {
    if (++ready < 2) return;
    t.start = Date.now();
    const res = post(`/conversations/${c.id}/calls`, {}, c.at, 'call_start', undefined, [409]);
    if (res.status === 409) {
      callBusy.add(1);
      return finish(true);
    }
    callId = json(res, 'data.id');
    if (res.status !== 201 || !callId) return finish(false);
  };
  sa = openSocket(c.at, {
    onReady: go,
    onEvent(name, frame) {
      if (name === 'call:accepted' && !t.accepted) {
        t.accepted = Date.now();
        callAcceptMs.add(t.accepted - t.incoming);
        // both sides push SDP/ICE-sized messages for the other
        sa.emit('call:signal', { callId, data: { type: 'offer', sdp: SDP, ts: Date.now() } });
        sc.emit('call:signal', { callId, data: { type: 'answer', sdp: SDP, ts: Date.now() } });
      } else if (name === 'call:signal') {
        callSignalMs.add(Math.max(0, Date.now() - Number((/"ts":(\d+)/.exec(frame) || [])[1] || Date.now())));
        if (++signals >= 2) {
          const e0 = Date.now();
          post(`/calls/${callId}/end`, {}, c.at, 'call_end');
          callEndMs.add(Date.now() - e0);
          // give the other side a moment to hear call:ended, then stop
          setTimeout(() => finish(true), 800);
        }
      }
    },
  });
  sc = openSocket(c.ct, {
    onReady: go,
    onEvent(name, frame) {
      if (name === 'call:incoming' && !t.incoming) {
        t.incoming = Date.now();
        callRingMs.add(t.incoming - t.start);
        post(`/calls/${callId}/accept`, {}, c.ct, 'call_accept');
      } else if (name === 'call:signal') {
        callSignalMs.add(Math.max(0, Date.now() - Number((/"ts":(\d+)/.exec(frame) || [])[1] || Date.now())));
        if (++signals >= 2 && !done) {
          const e0 = Date.now();
          post(`/calls/${callId}/end`, {}, c.at, 'call_end', undefined, [404, 409]);
          callEndMs.add(Date.now() - e0);
          setTimeout(() => finish(true), 800);
        }
      }
    },
  });
  // nothing may hang: 20 s for the whole flow
  setTimeout(() => finish(false), 20000);
}

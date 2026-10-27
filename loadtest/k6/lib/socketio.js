// Socket.IO v4 over k6's own WebSocket (k6/websockets) - no xk6 extension,
// no npm: the protocol is small text frames (Engine.IO v4 + Socket.IO v5):
//
//   server -> "0{...}"             Engine.IO open (sid, pingInterval)
//   client -> "40/realtime,{...}"  connect to the namespace with the auth payload
//   server -> "40/realtime,{sid}"  namespace connected ("44/realtime,..." = refused)
//   server -> "42/realtime,[\"realtime:ready\",{...}]"  handshake finished: emit only after this
//   server -> "2"  /  client -> "3"          ping / pong (every ~25 s)
//   client -> "42/realtime,<id>[\"event\",{...}]"  emit with an ack id
//   server -> "43/realtime,<id>[...]"        the ack
//   server -> "42/realtime,[\"event\",{...}]"      an event for us
//
// Socket.IO v4 framing; the namespace is REALTIME_NAMESPACE
// (/realtime, apps/api/src/modules/realtime). Why not the socket.io client
// in a bundle: it needs a bundler step and XHR polling; the framing above is
// exactly what the app's websocket transport sends, so the server work is
// the same.
import { WebSocket } from 'k6/websockets';
import { Trend, Rate, Counter } from 'k6/metrics';
import { WS_URL, HOST_HEADER } from './env.js';

export const wsConnectMs = new Trend('ws_connect_ms', true);
export const wsConnected = new Rate('ws_connected');
export const wsEvents = new Counter('ws_events');
export const wsDrops = new Counter('ws_unexpected_close');
const NS = '/realtime';

/**
 * handlers: { onReady(sock), onEvent(name, rawFrame, sock), onClose() }
 * returns sock { emit(event, data, ackCb), close() }
 */
export function openSocket(token, handlers) {
  const t0 = Date.now();
  const headers = HOST_HEADER ? { Host: HOST_HEADER } : {};
  const ws = new WebSocket(`${WS_URL}/socket.io/?EIO=4&transport=websocket`, null, { headers });
  let ready = false;
  let closedByUs = false;
  let failed = false;
  let ack = 0;
  const acks = {};
  const sock = {
    emit(event, data, cb) {
      let id = '';
      if (cb) {
        id = String(++ack);
        acks[id] = cb;
      }
      ws.send(`42${NS},${id}${JSON.stringify(data === undefined ? [event] : [event, data])}`);
    },
    close() {
      closedByUs = true;
      try {
        ws.close();
      } catch (_) {
        /* already closed */
      }
    },
  };
  ws.onmessage = (e) => {
    const m = e.data;
    if (typeof m !== 'string') return;
    const c = m.charCodeAt(0);
    if (c === 50 && m.length === 1) return ws.send('3'); // "2" ping -> "3" pong
    if (c === 48) return ws.send(`40${NS},${JSON.stringify({ token })}`); // "0" open
    if (m.startsWith(`40${NS}`)) return; // namespace connected; the server is ready at the `realtime:ready` event
    if (m.startsWith(`44${NS}`)) {
      failed = true;
      wsConnected.add(false);
      closedByUs = true;
      return ws.close();
    }
    if (m.startsWith(`43${NS},`)) {
      const rest = m.slice(NS.length + 3);
      const k = rest.indexOf('[');
      const id = rest.slice(0, k);
      if (acks[id]) {
        let args = [];
        try {
          args = JSON.parse(rest.slice(k));
        } catch (_) {
          /* ignore */
        }
        const cb = acks[id];
        delete acks[id];
        cb(args[0]);
      }
      return;
    }
    if (m.startsWith(`42${NS},`)) {
      wsEvents.add(1);
      const k = m.indexOf('["', NS.length + 3);
      const end = k < 0 ? -1 : m.indexOf('"', k + 2);
      const name = end < 0 ? '' : m.slice(k + 2, end);
      if (name === 'realtime:ready' && !ready) {
        // The server finishes the handshake (session, rooms) after the namespace
        // ack; emitting before this event is answered {ok:false}.
        ready = true;
        wsConnected.add(true);
        wsConnectMs.add(Date.now() - t0);
        if (handlers.onReady) handlers.onReady(sock);
        return;
      }
      if (name === 'auth:error' && !ready) {
        failed = true;
        wsConnected.add(false);
        closedByUs = true;
        return ws.close();
      }
      if (handlers.onEvent) handlers.onEvent(name, m, sock);
    }
  };
  ws.onerror = () => {
    if (!ready && !failed) {
      failed = true;
      wsConnected.add(false);
    }
  };
  ws.onclose = () => {
    if (!ready && !closedByUs && !failed) {
      failed = true;
      wsConnected.add(false);
    } else if (ready && !closedByUs) wsDrops.add(1);
    if (handlers.onClose) handlers.onClose();
  };
  return sock;
}

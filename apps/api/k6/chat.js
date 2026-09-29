import http from 'k6/http';
import ws from 'k6/ws';
import { check } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { CLIENT_TOKENS, CONVERSATION_IDS, BASE_URL, WS_URL, WRITE_THRESHOLDS, auth, pick, stages } from './lib/config.js';

export const options = {
  scenarios: {
    messages: { ...stages('write'), exec: 'message' },
    sockets: { executor: 'constant-vus', vus: Number(__ENV.WS_VUS || 200), duration: __ENV.STAGE === 'soak' ? '60m' : '2m', exec: 'socket' },
  },
  thresholds: { ...WRITE_THRESHOLDS, ws_connecting: ['p(95)<1000'] },
};

export function message() {
  const t = pick(CLIENT_TOKENS);
  const res = http.post(
    `${BASE_URL}/conversations/${pick(CONVERSATION_IDS)}/messages`,
    JSON.stringify({ clientMessageId: uuidv4(), body: `load ${Date.now()}` }),
    auth(t),
  );
  check(res, { 'message 201': (r) => r.status === 201 });
}

/** Socket.IO over raw WebSocket (Engine.IO v4 framing). */
export function socket() {
  const t = pick(CLIENT_TOKENS);
  const url = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;
  const res = ws.connect(url, {}, (s) => {
    s.on('open', () => {
      // 40 = connect to namespace with auth payload
      s.send(`40/realtime,${JSON.stringify({ token: t })}`);
    });
    s.on('message', (m) => {
      if (m.startsWith('2')) s.send('3'); // ping → pong
      if (m.startsWith('40/realtime')) {
        s.send(`42/realtime,${JSON.stringify(['conversation:join', { conversationId: pick(CONVERSATION_IDS) }])}`);
      }
    });
    s.setTimeout(() => s.close(), 30000);
  });
  check(res, { 'ws 101': (r) => r && r.status === 101 });
}

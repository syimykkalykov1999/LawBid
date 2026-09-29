import { READ_THRESHOLDS, WEIGHTS, WRITE_THRESHOLDS, stages } from './lib/config.js';
export { feed } from './feed.js';
export { search } from './search.js';
export { cases } from './attorney-cases.js';
export { bid } from './bid.js';
export { message, socket } from './chat.js';
export { login } from './otp-login.js';
export { webhook } from './webhooks.js';

// docs/06 §9.4: the mix that adds up to the 5k RPS peak; STAGE=soak keeps
// 60 % of it for an hour.
export const options = {
  scenarios: {
    feed: { ...stages('read', WEIGHTS.feed), exec: 'feed' },
    search: { ...stages('read', WEIGHTS.search), exec: 'search' },
    cases: { ...stages('read', WEIGHTS.cases), exec: 'cases' },
    bid: { ...stages('write', WEIGHTS.bid), exec: 'bid' },
    message: { ...stages('write', WEIGHTS.message), exec: 'message' },
    sockets: { executor: 'constant-vus', vus: Number(__ENV.WS_VUS || 500), duration: __ENV.STAGE === 'soak' ? '60m' : '5m', exec: 'socket' },
    login: { ...stages('write', WEIGHTS.login), exec: 'login' },
    webhook: { ...stages('write', WEIGHTS.webhook), exec: 'webhook' },
  },
  thresholds: {
    http_req_failed: ['rate<0.005'],
    checks: ['rate>0.995'],
    'http_req_duration{scenario:feed}': READ_THRESHOLDS.http_req_duration,
    'http_req_duration{scenario:search}': READ_THRESHOLDS.http_req_duration,
    'http_req_duration{scenario:cases}': READ_THRESHOLDS.http_req_duration,
    'http_req_duration{scenario:bid}': WRITE_THRESHOLDS.http_req_duration,
    'http_req_duration{scenario:message}': WRITE_THRESHOLDS.http_req_duration,
    'http_req_duration{scenario:login}': WRITE_THRESHOLDS.http_req_duration,
    'http_req_duration{scenario:webhook}': WRITE_THRESHOLDS.http_req_duration,
  },
};

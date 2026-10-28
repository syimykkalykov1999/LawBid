// The HTTP mix: one k6 iteration = one "thing a person does". Weights are
// shares of ITERATIONS; `reqs` is the number of HTTP requests the action
// sends (AVG_REQS_PER_ITER in profiles.js is the weighted average, kept
// honest by the weights check at the bottom).
//
//   cold start  : /me/session + /config/bootstrap + i18n bundle
//   feed/reels  : pages of the home feed (+ next page) and the reels list
//   profile     : an attorney's page and posts
//   search      : people / attorneys / suggest
//   chat        : list, open (messages), send
//   notifications, cases + bids, one post
//   admin ~5 %  : lists, search, and ONE csv export in ~300 admin actions
//   static ~10 %: web assets through CloudFront (CDN_URL), if set
import { get, post, asset, json } from './http.js';
import {
  clientToken, attorneyToken, conversation, pick, rnd,
  POSTS, CASES, USERNAMES, ASSETS, ADM, LANGS,
} from './data.js';
import { CDN_URL } from './env.js';

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });

const WORDS = ['law', 'deposit', 'lease', 'visa', 'divorce', 'tax', 'patent', 'injury', 'will', 'asylum'];
const EXPORT_ENTITY = __ENV.EXPORT_ENTITY || 'bids';
let adminIterations = 0;

const actions = [
  // [name, weight, requests, fn]
  ['cold_start', 8, 3, () => {
    const t = clientToken(rnd);
    get('/me/session', t, 'session');
    get('/config/bootstrap', t, 'bootstrap');
    if (LANGS.length) get(`/i18n/bundle/${pick(LANGS)}`, t, 'i18n');
  }],
  ['feed', 16, 1.4, () => {
    const t = clientToken(rnd);
    const r = get('/feed?limit=20', t, 'feed');
    const cursor = json(r, 'meta.nextCursor');
    if (cursor && rnd() < 0.4) get(`/feed?limit=20&cursor=${encodeURIComponent(cursor)}`, t, 'feed_p2');
  }],
  // 403 VIDEO_UNAVAILABLE = the video feature flag is off in this stack: not a failure
  ['reels', 8, 1, () => get('/reels', clientToken(rnd), 'reels', undefined, [403])],
  ['profile', 8, 1, () => {
    const u = pick(USERNAMES);
    if (u) get(`/attorneys/${u}`, clientToken(rnd), 'attorney_profile');
  }],
  ['post', 3, 1, () => {
    const id = pick(POSTS);
    if (id) get(`/posts/${id}`, clientToken(rnd), 'post');
  }],
  ['search', 8, 1.3, () => {
    const t = clientToken(rnd);
    const q = pick(WORDS);
    const kind = rnd();
    if (kind < 0.4) get(`/search/attorneys?q=${q}`, t, 'search_attorneys');
    else if (kind < 0.8) get(`/search/people?q=${q}`, t, 'search_people');
    else get(`/search/suggest?q=${q.slice(0, 3)}`, t, 'search_suggest');
  }],
  ['chat_list', 7, 1, () => get('/conversations', clientToken(rnd), 'chat_list')],
  ['chat_open', 6, 1, () => {
    const c = conversation(rnd);
    if (c) get(`/conversations/${c.id}/messages`, c.ct, 'chat_messages');
  }],
  ['chat_send', 4, 1, () => {
    const c = conversation(rnd);
    if (c) post(`/conversations/${c.id}/messages`, { clientMessageId: uuid(), body: `load ${Date.now()}` }, rnd() < 0.5 ? c.ct : c.at, 'chat_send');
  }],
  ['notifications', 5, 1.5, () => {
    const t = clientToken(rnd);
    get('/notifications', t, 'notifications');
    if (rnd() < 0.5) get('/badges', t, 'badges');
  }],
  ['cases', 5, 2, () => {
    get('/cases', attorneyToken(rnd), 'cases_feed');
    const c = pick(CASES);
    if (c) {
      get('/users/me/cases', c.t, 'my_cases');
    }
  }],
  ['bids', 2, 1, () => {
    const c = pick(CASES);
    if (c) get(`/cases/${c.id}/bids`, c.t, 'case_bids');
  }],
  ['admin', 5, 1.2, () => {
    const t = pick(ADM);
    if (!t) return get('/me/session', clientToken(rnd), 'session');
    adminIterations++;
    const k = rnd();
    if (k < 0.45) get('/admin/users?limit=20', t, 'admin_users');
    else if (k < 0.8) get(`/admin/users?q=${pick(['perf', 'Sofia', 'Carter', 'Kim'])}`, t, 'admin_search');
    else get('/admin/case-disputes', t, 'admin_disputes');
    if (adminIterations % 300 === 0) get(`/admin/export/${EXPORT_ENTITY}`, t, 'admin_export');
  }],
  ['static', 10, 1, () => {
    if (!CDN_URL) return get('/config/bootstrap', clientToken(rnd), 'bootstrap');
    const a = pick(ASSETS) || '/index.html';
    asset(a);
  }],
];

const total = actions.reduce((a, x) => a + x[1], 0);
const cum = [];
actions.reduce((a, x, i) => (cum[i] = a + x[1]), 0);
export const avgReqs = actions.reduce((a, x) => a + (x[1] / total) * x[2], 0);

// SKIP_ACTIONS=cases,search (comma list of action names): those actions are
// re-drawn, i.e. left out of the mix. For "what breaks second" runs when the
// first bottleneck is already known (local runs, docs/perf/LOCAL_LOAD_TEST_2026-10-28.md).
const SKIP = (__ENV.SKIP_ACTIONS || "").split(",").map((s) => s.trim()).filter(Boolean);

export function runOne() {
  if (SKIP.length) {
    for (let k = 0; k < 50; k++) {
      const r = Math.random() * total;
      for (let i = 0; i < actions.length; i++) {
        if (r < cum[i]) {
          if (SKIP.indexOf(actions[i][0]) === -1) return actions[i][3]();
          break;
        }
      }
    }
    return undefined;
  }
  const r = Math.random() * total;
  for (let i = 0; i < actions.length; i++) {
    if (r < cum[i]) return actions[i][3]();
  }
}

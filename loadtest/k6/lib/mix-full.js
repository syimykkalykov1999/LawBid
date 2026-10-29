// The FULL mix (round 2 of docs/perf/LOCAL_LOAD_TEST_2026-10-28.md): every
// user-facing endpoint family the app calls, plus the admin hot pages with
// ONE admin session. Chosen with MIX=full (vus.js); lib/mix.js stays the
// short mix of round 1.
//
// One k6 iteration = one thing a person does in the app (an "action"); an
// action may send several requests, the way the screen does. Weights are
// shares of iterations. Business-rule answers that are normal for the seeded
// data (402 no credits, 403 not allowed for this account, 404 gone, 409
// already done, 422 not eligible) are listed per call as "expected": they
// are measured but not counted as failures. 5xx and timeouts always are.
//
// Writes are real writes into the load-test database (cases, bids, comments,
// likes, follows, messages, read marks, call rows): the stack is a throw-away
// copy, never production (lib/env.js refuses production hosts).
import { get, post, put, del, json } from './http.js';
import {
  clientToken, attorneyToken, conversation, pick, rnd,
  POSTS, CASES, USERNAMES, ATTORNEY_IDS, ADM, LANGS, PRACTICES, DEALS, STATES,
} from './data.js';

const uuid = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
const hex64 = () => {
  let s = '';
  for (let i = 0; i < 64; i++) s += ((Math.random() * 16) | 0).toString(16);
  return s;
};
const list = (r, path) => {
  const d = json(r, path || 'data');
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.items)) return d.items;
  return [];
};
// the API validates path ids as version-4 uuids; most seeded rows have md5
// ids that are not, so only v4 ids from a list are followed
const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const firstId = (r, path) => {
  const l = list(r, path).filter((x) => x && V4.test(x.id || ''));
  const x = l.length ? l[Math.floor(Math.random() * Math.min(l.length, 10))] : undefined;
  return x && x.id;
};

const WORDS = ['law', 'deposit', 'lease', 'visa', 'divorce', 'tax', 'patent', 'injury', 'will', 'asylum'];
const BIZ = [400, 402, 403, 404, 409, 422]; // business-rule answers for writes on seeded data
const R404 = [403, 404];

// The ONE admin session: every admin action uses the same token (one person
// at a desk), and admin actions are rare.
let ADMIN_TOKEN;
const admin = () => {
  if (ADMIN_TOKEN === undefined) ADMIN_TOKEN = ADM.length ? ADM[0] : null;
  return ADMIN_TOKEN;
};

const actions = [
  // [name, weight, fn]
  // ---------- start + settings ----------
  ['cold_start', 7, () => {
    const t = rnd() < 0.85 ? clientToken(rnd) : attorneyToken(rnd);
    get('/me/session', t, 'session');
    get('/config/bootstrap', t, 'bootstrap');
    if (LANGS.length) get(`/i18n/bundle/${pick(LANGS)}`, t, 'i18n');
    get('/badges', t, 'badges');
  }],
  ['settings', 3, () => {
    const t = rnd() < 0.7 ? clientToken(rnd) : attorneyToken(rnd);
    const k = rnd();
    if (k < 0.3) get('/users/me', t, 'users_me');
    else if (k < 0.5) get('/users/me/privacy', t, 'users_privacy');
    else if (k < 0.7) get('/notification-settings', t, 'notif_settings');
    else if (k < 0.85) get('/users/me/profile', t, 'users_profile', undefined, R404);
    else put('/users/me/activity-status', { showActivityStatus: true }, t, 'activity_status_put', BIZ);
  }],
  ['verification', 2, () => {
    if (rnd() < 0.5) {
      const t = attorneyToken(rnd);
      get('/verification/me', t, 'verification_me');
      get('/trust/me', t, 'trust_me', undefined, R404);
    } else get('/verification/client/me', clientToken(rnd), 'verification_client_me', undefined, R404);
  }],
  // ---------- feed / posts / reels / stories ----------
  ['feed', 14, () => {
    const t = clientToken(rnd);
    const r = get('/feed?limit=20', t, 'feed');
    const cursor = json(r, 'meta.nextCursor');
    if (cursor && rnd() < 0.4) get(`/feed?limit=20&cursor=${encodeURIComponent(cursor)}`, t, 'feed_p2');
    if (rnd() < 0.5) get('/stories/tray', t, 'stories_tray');
  }],
  ['reels', 5, () => get('/reels', clientToken(rnd), 'reels', undefined, [403])],
  ['post_open', 5, () => {
    const id = pick(POSTS);
    if (!id) return;
    const t = clientToken(rnd);
    get(`/posts/${id}`, t, 'post', undefined, R404);
    const r = get(`/posts/${id}/comments`, t, 'post_comments', undefined, R404);
    const cid = firstId(r);
    if (cid && rnd() < 0.2) get(`/comments/${cid}/replies`, t, 'comment_replies', undefined, R404);
    if (rnd() < 0.3) post(`/posts/${id}/view`, undefined, t, 'post_view', undefined, BIZ);
  }],
  ['like', 5, () => {
    const id = pick(POSTS);
    if (!id) return;
    const t = clientToken(rnd);
    if (rnd() < 0.8) post(`/posts/${id}/like`, undefined, t, 'post_like', undefined, BIZ);
    else del(`/posts/${id}/like`, t, 'post_unlike', BIZ);
  }],
  ['comment', 2, () => {
    const id = pick(POSTS);
    if (!id) return;
    const t = clientToken(rnd);
    const r = post(`/posts/${id}/comments`, { body: `Load test comment ${Date.now()}` }, t, 'comment_create', undefined, BIZ);
    const cid = json(r, 'data.id');
    if (cid && rnd() < 0.3) post(`/comments/${cid}/like`, undefined, clientToken(rnd), 'comment_like', undefined, BIZ);
  }],
  // ---------- profiles / follows ----------
  ['profile', 7, () => {
    const u = pick(USERNAMES);
    const t = clientToken(rnd);
    if (u) get(`/attorneys/${u}`, t, 'attorney_profile', undefined, R404);
    const a = pick(ATTORNEY_IDS);
    if (!a) return;
    const k = rnd();
    if (k < 0.5) get(`/attorneys/${a}/posts`, t, 'attorney_posts', undefined, R404);
    else if (k < 0.7) get(`/attorneys/${a}/reviews/summary`, t, 'attorney_reviews', undefined, R404);
    else if (k < 0.85) get(`/attorneys/${a}/followers`, t, 'attorney_followers', undefined, R404);
    else get(`/attorneys/${a}/following`, t, 'attorney_following', undefined, R404);
  }],
  ['follow', 2, () => {
    const a = pick(ATTORNEY_IDS);
    if (!a) return;
    const t = clientToken(rnd);
    if (rnd() < 0.7) post(`/attorneys/${a}/follow`, undefined, t, 'follow', undefined, BIZ);
    else del(`/attorneys/${a}/follow`, t, 'unfollow', BIZ);
    if (rnd() < 0.3) get('/users/me/following', t, 'my_following');
  }],
  // ---------- search ----------
  ['search', 7, () => {
    const t = clientToken(rnd);
    const q = pick(WORDS);
    const k = rnd();
    if (k < 0.25) get(`/search/attorneys?q=${q}`, t, 'search_attorneys');
    else if (k < 0.5) get(`/search/people?q=${q}`, t, 'search_people');
    else if (k < 0.7) get(`/search/posts?q=${q}`, t, 'search_posts');
    else if (k < 0.85) get(`/search/suggest?q=${q.slice(0, 3)}`, t, 'search_suggest');
    else get(`/search/cases?q=${q}`, attorneyToken(rnd), 'search_cases', undefined, R404);
  }],
  // ---------- cases ----------
  ['cases_feed', 5, () => {
    const t = attorneyToken(rnd);
    const r = get('/cases', t, 'cases_feed');
    const id = firstId(r);
    if (id) {
      get(`/cases/${id}`, t, 'case_detail', undefined, R404);
      if (rnd() < 0.3) post('/cases/views', { caseIds: [id] }, t, 'case_views', undefined, BIZ);
      if (rnd() < 0.15) {
        post(`/cases/${id}/bids`, {
          feeType: 'fixed', amountCents: 50000, message: 'Load test offer: I can help with this case quickly.',
          startAvailability: 'immediately', estimatedDurationDays: 14,
        }, t, 'bid_create', undefined, BIZ);
      }
    }
  }],
  ['my_cases', 4, () => {
    const c = pick(CASES);
    if (!c) return;
    get('/users/me/cases', c.t, 'my_cases');
    get(`/cases/${c.id}/bids`, c.t, 'case_bids', undefined, R404);
    if (rnd() < 0.3) get(`/cases/${c.id}/activity`, c.t, 'case_activity', undefined, R404);
  }],
  ['my_offers', 2, () => {
    const t = attorneyToken(rnd);
    const r = get('/users/me/bids', t, 'my_bids');
    const id = firstId(r);
    if (id && rnd() < 0.5) get(`/bids/${id}`, t, 'bid_detail', undefined, R404);
  }],
  ['deal', 1, () => {
    const d = pick(DEALS);
    if (!d) return;
    get(`/cases/${d.id}/deal-record`, d.t, 'deal_record', undefined, R404);
    if (rnd() < 0.5) get(`/cases/${d.id}/workspace`, d.t, 'case_workspace', undefined, R404);
  }],
  ['case_create', 1, () => {
    const p = pick(PRACTICES);
    const s = pick(STATES) || 'CA';
    if (!p) return;
    post('/cases', {
      practiceAreaId: p, title: `Load test case ${Date.now() % 100000}`,
      description: 'Load test case description: need help with a dispute about a lease deposit.',
      primaryStateCode: s, budgetMode: 'clarify_later', urgency: 'flexible',
    }, clientToken(rnd), 'case_create', undefined, BIZ);
  }],
  // ---------- chats ----------
  ['chat_list', 6, () => {
    const t = clientToken(rnd);
    get('/conversations', t, 'chat_list');
    if (rnd() < 0.3) get('/conversations/folders/counts', t, 'chat_folder_counts');
    if (rnd() < 0.2) get('/conversations/requests/count', t, 'chat_requests_count');
  }],
  ['chat_open', 6, () => {
    const c = conversation(rnd);
    if (!c) return;
    const me = rnd() < 0.5 ? c.ct : c.at;
    const r = get(`/conversations/${c.id}/messages`, me, 'chat_messages');
    const l = list(r);
    const last = l.length ? (l[0].createdAt >= l[l.length - 1].createdAt ? l[0] : l[l.length - 1]) : null;
    if (last && last.id) {
      post(`/conversations/${c.id}/read`, { lastReadMessageId: last.id }, me, 'chat_read', undefined, BIZ);
      if (rnd() < 0.3) post(`/conversations/${c.id}/delivered`, { lastDeliveredMessageId: last.id }, me, 'chat_delivered', undefined, BIZ);
    }
    if (rnd() < 0.1) get(`/conversations/${c.id}`, me, 'chat_detail', undefined, R404);
  }],
  ['chat_send', 4, () => {
    const c = conversation(rnd);
    if (c) post(`/conversations/${c.id}/messages`, { clientMessageId: uuid(), body: `load ${Date.now()}` }, rnd() < 0.5 ? c.ct : c.at, 'chat_send');
  }],
  // Desktop web (weight 0: only with ONLY_ACTIONS=web_chats, calib.sh): the
  // chats screen shows the list and an open chat side by side; the person
  // opens it, reads the top chat, then clicks through two more.
  ['web_chats', 0, () => {
    const c = conversation(rnd);
    if (!c) return;
    get('/conversations', c.ct, 'chat_list');
    for (let i = 0; i < 3; i++) {
      const x = i === 0 ? c : conversation(rnd);
      if (!x) continue;
      const r = get(`/conversations/${x.id}/messages`, x.ct, 'chat_messages');
      const l = list(r);
      const last = l.length ? (l[0].createdAt >= l[l.length - 1].createdAt ? l[0] : l[l.length - 1]) : null;
      if (last && last.id) post(`/conversations/${x.id}/read`, { lastReadMessageId: last.id }, x.ct, 'chat_read', undefined, BIZ);
    }
  }],
  ['upload', 1, () => {
    // attachments metadata: the presign step every photo/file/voice message
    // starts with (the bytes go to S3, not to the API)
    const t = rnd() < 0.5 ? clientToken(rnd) : attorneyToken(rnd);
    post('/files/presign', { purpose: rnd() < 0.7 ? 'chat_attachment' : 'post_image', mime: 'image/jpeg', sizeBytes: 180000 + ((rnd() * 200000) | 0), sha256: hex64() }, t, 'files_presign', undefined, [400, 403, 409, 413, 422, 429, 503]);
  }],
  // ---------- calls (signalling REST) ----------
  ['calls', 1, () => {
    const c = conversation(rnd);
    const t = c ? c.ct : clientToken(rnd);
    const k = rnd();
    if (k < 0.35) get('/calls/history', t, 'calls_history');
    else if (k < 0.55) get('/calls/ongoing', t, 'calls_ongoing');
    else if (k < 0.75) get('/calls/ice-servers', t, 'calls_ice', undefined, [403, 503]);
    else if (c) {
      const r = post(`/conversations/${c.id}/calls`, { video: false }, c.at, 'call_start', undefined, BIZ);
      const id = json(r, 'data.id') || json(r, 'data.callId');
      if (id) post(`/calls/${id}/end`, {}, c.at, 'call_end', undefined, BIZ);
    }
  }],
  // ---------- notifications ----------
  ['notifications', 5, () => {
    const t = clientToken(rnd);
    const r = get('/notifications', t, 'notifications');
    if (rnd() < 0.3) {
      const ids = list(r).slice(0, 5).map((n) => n.id).filter(Boolean);
      if (ids.length) post('/notifications/read', { ids }, t, 'notifications_read', undefined, BIZ);
    }
  }],
  // ---------- admin: one session, hot pages ----------
  ['admin', 1, () => {
    const t = admin();
    if (!t) return;
    const k = rnd();
    if (k < 0.25) {
      const r = get('/admin/verification/requests?limit=20', t, 'admin_verif_queue');
      const id = firstId(r);
      if (id) get(`/admin/verification/requests/${id}`, t, 'admin_verif_review', undefined, R404);
    } else if (k < 0.45) get('/admin/moderation/queue', t, 'admin_mod_queue');
    else if (k < 0.65) {
      get('/admin/staff/today', t, 'admin_today', undefined, R404);
      get('/admin/staff/today/system', t, 'admin_today_system', undefined, R404);
    } else if (k < 0.8) get('/admin/system-health', t, 'admin_system_health');
    else if (k < 0.9) get('/admin/overview', t, 'admin_overview', undefined, R404);
    else get('/admin/users?limit=20', t, 'admin_users');
  }],
];

export const ENDPOINTS_FULL = [
  'session', 'bootstrap', 'i18n', 'badges', 'users_me', 'users_privacy', 'notif_settings', 'users_profile', 'activity_status_put',
  'verification_me', 'trust_me', 'verification_client_me', 'feed', 'feed_p2', 'stories_tray', 'reels', 'post', 'post_comments',
  'comment_replies', 'post_view', 'post_like', 'post_unlike', 'comment_create', 'comment_like', 'attorney_profile', 'attorney_posts',
  'attorney_reviews', 'attorney_followers', 'attorney_following', 'follow', 'unfollow', 'my_following', 'search_attorneys',
  'search_people', 'search_posts', 'search_suggest', 'search_cases', 'cases_feed', 'case_detail', 'case_views', 'bid_create',
  'my_cases', 'case_bids', 'case_activity', 'my_bids', 'bid_detail', 'deal_record', 'case_workspace', 'case_create', 'chat_list',
  'chat_folder_counts', 'chat_requests_count', 'chat_messages', 'chat_read', 'chat_delivered', 'chat_detail', 'chat_send',
  'chat_send_ws', 'files_presign', 'calls_history', 'calls_ongoing', 'calls_ice', 'call_start', 'call_end', 'notifications',
  'notifications_read', 'admin_verif_queue', 'admin_verif_review', 'admin_mod_queue', 'admin_today', 'admin_today_system',
  'admin_system_health', 'admin_overview', 'admin_users',
];

const total = actions.reduce((a, x) => a + x[1], 0);
const cum = [];
actions.reduce((a, x, i) => (cum[i] = a + x[1]), 0);
const SKIP = (__ENV.SKIP_ACTIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
// ONLY_ACTIONS=feed (comma list): run just these actions - the per-action cost
// calibration (local-docker/calib.sh: API / Postgres CPU, SQL and Redis
// commands per request)
const ONLY = (__ENV.ONLY_ACTIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
const only = ONLY.length ? actions.filter((a) => ONLY.indexOf(a[0]) !== -1) : null;

export function runOneFull() {
  if (only) return only.length ? only[Math.floor(Math.random() * only.length)][2]() : undefined;
  for (let k = 0; k < 50; k++) {
    const r = Math.random() * total;
    for (let i = 0; i < actions.length; i++) {
      if (r < cum[i]) {
        if (SKIP.indexOf(actions[i][0]) === -1) return actions[i][2]();
        break;
      }
    }
  }
  return undefined;
}

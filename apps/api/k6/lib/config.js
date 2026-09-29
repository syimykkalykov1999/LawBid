// Shared options for the docs/06 §9.4 scenarios.
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api/v1';
export const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';

const list = (name) => {
  try {
    return JSON.parse(__ENV[name] || '[]');
  } catch {
    return [];
  }
};
export const CLIENT_TOKENS = list('CLIENT_TOKENS');
export const ATTORNEY_TOKENS = list('ATTORNEY_TOKENS');
export const CASE_IDS = list('CASE_IDS');
export const CONVERSATION_IDS = list('CONVERSATION_IDS');

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const auth = (token) => ({
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
});

/** docs/06 §9.4 targets. */
export const READ_THRESHOLDS = {
  http_req_failed: ['rate<0.005'],
  http_req_duration: ['p(95)<300'],
  checks: ['rate>0.995'],
};
export const WRITE_THRESHOLDS = {
  http_req_failed: ['rate<0.005'],
  http_req_duration: ['p(95)<600'],
  checks: ['rate>0.995'],
};

/** docs/06 §9.4: 5 000 RPS peak, split across the scenarios of all.js by
 * weight (a single-scenario run gets the whole budget). */
export const PEAK_RPS = Number(__ENV.PEAK_RPS || 5000);
export const WEIGHTS = {
  feed: 0.4,
  search: 0.15,
  cases: 0.2,
  bid: 0.05,
  message: 0.1,
  login: 0.02,
  webhook: 0.01,
};

/** Paid or rate-limited flows (OTP → SMS/email, Stripe test-mode reads)
 * run only when the operator confirms staging uses the mock providers. */
export function requirePaidFlowsAllowed(name) {
  if (__ENV.STAGING_MOCK_PROVIDERS !== '1') {
    throw new Error(
      `: set STAGING_MOCK_PROVIDERS=1 only when SMS_PROVIDER/EMAIL_PROVIDER are mock and Stripe is test mode`,
    );
  }
}

/** smoke: does it work; peak: the weighted share of 5k RPS for 10 min;
 * soak: 1 hour at 60 %. */
export function stages(kind = 'read', weight = 1) {
  const stage = __ENV.STAGE || 'smoke';
  const peak = Math.max(1, Math.round(PEAK_RPS * weight));
  if (stage === 'peak') {
    return {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 5000,
      stages: [
        { target: peak, duration: '3m' },
        { target: peak, duration: '10m' },
        { target: 0, duration: '1m' },
      ],
    };
  }
  if (stage === 'soak') {
    return {
      executor: 'constant-arrival-rate',
      rate: Math.round(peak * 0.6),
      timeUnit: '1s',
      duration: '60m',
      preAllocatedVUs: 400,
      maxVUs: 4000,
    };
  }
  return {
    executor: 'constant-arrival-rate',
    rate: 20,
    timeUnit: '1s',
    duration: '1m',
    preAllocatedVUs: 20,
    maxVUs: 100,
  };
}

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

/** smoke: does it work; peak: 5k RPS for 10 min; soak: 1 hour at 60 %. */
export function stages(kind = 'read') {
  const stage = __ENV.STAGE || 'smoke';
  const peak = kind === 'read' ? 3500 : 1500; // 5k RPS shared across kinds
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

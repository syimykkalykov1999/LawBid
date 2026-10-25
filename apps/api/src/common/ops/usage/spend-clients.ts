import { withTimeout } from '../../resilience/resilience';
import {
  CLOUDFLARE_GRAPHQL_URL,
  monthRange,
  type FetchFn,
} from './usage-clients';

/**
 * Owner 2026-10-24 («Расходы»): readers for what each outside service has
 * charged. Pure functions over an injectable `fetch`, like usage-clients.
 * Every one throws a short readable message on failure; none logs a key.
 *
 * Twilio: Usage Records (`/Usage/Records/ThisMonth|LastMonth|Daily.json`,
 * field `price` per `category`, `totalprice` = all) and `/Balance.json`.
 * Bunny: Core API `GET /billing` (`Balance`, `ThisMonthCharges`).
 * Stripe: `GET /v1/balance_transactions` (`fee` of each charge, and
 * `stripe_fee` rows for the platform's own bills).
 * Cloudflare R2: GraphQL datasets `r2StorageAdaptiveGroups` and
 * `r2OperationsAdaptiveGroups`.
 */
const TIMEOUT_MS = 10_000;

async function getJson(
  label: string,
  url: string,
  init: RequestInit,
  fetchFn: FetchFn,
): Promise<unknown> {
  const res = await withTimeout(label, TIMEOUT_MS, () => fetchFn(url, init));
  if (!res.ok) throw new Error(`${label} HTTP ${res.status}`);
  return res.json();
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

// --- Twilio ---------------------------------------------------------------

export interface TwilioSpend {
  thisMonth: { total: number; byCategory: { category: string; usd: number }[] };
  lastMonth: { total: number };
  daily: { date: string; usd: number }[];
  balanceUsd: number | null;
}

interface TwilioRecord {
  category?: string;
  price?: string | number | null;
  start_date?: string;
}

const TWILIO_TOTAL = 'totalprice';

export async function fetchTwilioSpend(
  accountSid: string,
  authToken: string,
  now: Date,
  fetchFn: FetchFn = fetch,
): Promise<TwilioSpend> {
  const headers = {
    authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
    accept: 'application/json',
  };
  const base = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}`;
  const records = async (path: string): Promise<TwilioRecord[]> =>
    (
      (await getJson(
        'twilio',
        `${base}/Usage/Records${path}`,
        { headers },
        fetchFn,
      )) as {
        usage_records?: TwilioRecord[];
      }
    ).usage_records ?? [];

  const from = new Date(now.getTime() - 29 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const [thisM, lastM, daily] = await Promise.all([
    records('/ThisMonth.json?PageSize=1000'),
    records('/LastMonth.json?PageSize=1000'),
    records(
      `/Daily.json?Category=${TWILIO_TOTAL}&StartDate=${from}&EndDate=${to}&PageSize=100`,
    ),
  ]);
  let balanceUsd: number | null = null;
  try {
    const b = (await getJson(
      'twilio',
      `${base}/Balance.json`,
      { headers },
      fetchFn,
    )) as {
      balance?: string;
      currency?: string;
    };
    if (b.currency === 'USD' || b.currency === undefined) {
      balanceUsd = b.balance === undefined ? null : n(b.balance);
    }
  } catch {
    balanceUsd = null; // prepaid-only feature; a failure is not fatal
  }
  const cats = thisM
    .filter((r) => r.category && r.category !== TWILIO_TOTAL)
    .map((r) => ({ category: r.category!, usd: n(r.price) }))
    .filter((r) => r.usd > 0.0049)
    .sort((a, b) => b.usd - a.usd);
  return {
    thisMonth: {
      total: n(thisM.find((r) => r.category === TWILIO_TOTAL)?.price),
      byCategory: cats,
    },
    lastMonth: {
      total: n(lastM.find((r) => r.category === TWILIO_TOTAL)?.price),
    },
    daily: daily
      .map((r) => ({ date: r.start_date ?? '', usd: n(r.price) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    balanceUsd,
  };
}

// --- Bunny ----------------------------------------------------------------

export interface BunnySpend {
  thisMonthUsd: number | null;
  balanceUsd: number | null;
}

export async function fetchBunnySpend(
  accountKey: string,
  fetchFn: FetchFn = fetch,
): Promise<BunnySpend> {
  const b = (await getJson(
    'bunny_billing',
    'https://api.bunny.net/billing',
    { headers: { AccessKey: accountKey, accept: 'application/json' } },
    fetchFn,
  )) as { Balance?: number; ThisMonthCharges?: number };
  return {
    thisMonthUsd:
      typeof b.ThisMonthCharges === 'number' ? b.ThisMonthCharges : null,
    balanceUsd: typeof b.Balance === 'number' ? b.Balance : null,
  };
}

// --- Stripe fees ----------------------------------------------------------

export interface StripeFees {
  thisMonthUsd: number;
  lastMonthUsd: number;
  /** More than the pages we read: the figure is a lower bound. */
  truncated: boolean;
  daily: { date: string; usd: number }[];
  skippedCurrencies: string[];
}

interface BalanceTx {
  type?: string;
  amount?: number;
  fee?: number;
  currency?: string;
  created?: number;
}

const MAX_PAGES = 12;

export async function fetchStripeFees(
  secretKey: string,
  now: Date,
  fetchFn: FetchFn = fetch,
): Promise<StripeFees> {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const lastStart = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
  const thisStart = Math.floor(Date.UTC(y, m, 1) / 1000);
  const from30 = Math.floor(Date.UTC(y, m, now.getUTCDate() - 29) / 1000);
  const headers = { authorization: `Bearer ${secretKey}` };
  let startingAfter = '';
  let truncated = false;
  let thisCents = 0;
  let lastCents = 0;
  const byDay = new Map<string, number>();
  const skipped = new Set<string>();
  for (let page = 0; ; page++) {
    if (page >= MAX_PAGES) {
      truncated = true;
      break;
    }
    const url =
      `https://api.stripe.com/v1/balance_transactions?limit=100&created[gte]=${lastStart}` +
      (startingAfter
        ? `&starting_after=${encodeURIComponent(startingAfter)}`
        : '');
    const body = (await getJson('stripe', url, { headers }, fetchFn)) as {
      data?: (BalanceTx & { id?: string })[];
      has_more?: boolean;
    };
    const rows = body.data ?? [];
    for (const t of rows) {
      if ((t.currency ?? 'usd') !== 'usd') {
        skipped.add(String(t.currency));
        continue;
      }
      // A charge carries its Stripe fee in `fee`; Stripe's own bills
      // (Billing, Radar, Connect…) are separate `stripe_fee` rows.
      const cents = t.type === 'stripe_fee' ? -n(t.amount) : n(t.fee);
      const created = n(t.created);
      if (created >= thisStart) thisCents += cents;
      else lastCents += cents;
      if (created >= from30) {
        const day = new Date(created * 1000).toISOString().slice(0, 10);
        byDay.set(day, (byDay.get(day) ?? 0) + cents);
      }
    }
    if (!body.has_more || rows.length === 0) break;
    startingAfter = rows[rows.length - 1].id ?? '';
    if (!startingAfter) break;
  }
  return {
    thisMonthUsd: thisCents / 100,
    lastMonthUsd: lastCents / 100,
    truncated,
    daily: [...byDay.entries()]
      .map(([date, c]) => ({ date, usd: c / 100 }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    skippedCurrencies: [...skipped],
  };
}

// --- Cloudflare R2 --------------------------------------------------------

const CLASS_A = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'ListObjectsV2',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration',
]);
const FREE_ACTIONS = new Set([
  'DeleteObject',
  'DeleteBucket',
  'DeleteObjects',
  'AbortMultipartUpload',
]);

/** A: writes and listings; B: reads; deletes are free. */
export function r2OperationClass(action: string): 'A' | 'B' | 'free' {
  if (CLASS_A.has(action)) return 'A';
  if (FREE_ACTIONS.has(action)) return 'free';
  return 'B';
}

export interface R2Usage {
  storageGb: number;
  classAOps: number;
  classBOps: number;
}

const R2_QUERY = `query R2($accountTag: String!, $from: Time!, $to: Time!, $fromDay: Time!) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      storage: r2StorageAdaptiveGroups(limit: 100, filter: { datetime_geq: $fromDay, datetime_leq: $to }) {
        max { payloadSize metadataSize }
      }
      ops: r2OperationsAdaptiveGroups(limit: 1000, filter: { datetime_geq: $from, datetime_leq: $to }) {
        sum { requests }
        dimensions { actionType }
      }
    }
  }
}`;

export async function fetchR2Usage(
  accountId: string,
  token: string,
  now: Date,
  fetchFn: FetchFn = fetch,
): Promise<R2Usage> {
  const { from } = monthRange(now);
  const res = await withTimeout('cloudflare_graphql', TIMEOUT_MS, () =>
    fetchFn(CLOUDFLARE_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query: R2_QUERY,
        variables: {
          accountTag: accountId,
          from: `${from}T00:00:00Z`,
          to: now.toISOString(),
          fromDay: new Date(now.getTime() - 2 * 86_400_000).toISOString(),
        },
      }),
    }),
  );
  if (!res.ok) throw new Error(`Cloudflare GraphQL HTTP ${res.status}`);
  const body = (await res.json()) as {
    data?: {
      viewer?: {
        accounts?: {
          storage?: { max?: { payloadSize?: number; metadataSize?: number } }[];
          ops?: {
            sum?: { requests?: number };
            dimensions?: { actionType?: string };
          }[];
        }[];
      };
    } | null;
    errors?: { message?: string }[] | null;
  };
  if (body.errors?.length) {
    throw new Error(
      `Cloudflare GraphQL: ${body.errors[0]?.message ?? 'error'}`.slice(0, 200),
    );
  }
  const acc = body.data?.viewer?.accounts?.[0];
  // Storage is a gauge: the biggest recent reading per bucket, summed.
  let bytes = 0;
  for (const g of acc?.storage ?? []) {
    bytes += n(g.max?.payloadSize) + n(g.max?.metadataSize);
  }
  let a = 0;
  let b = 0;
  for (const g of acc?.ops ?? []) {
    const cls = r2OperationClass(g.dimensions?.actionType ?? '');
    if (cls === 'A') a += n(g.sum?.requests);
    else if (cls === 'B') b += n(g.sum?.requests);
  }
  return { storageGb: bytes / 1e9, classAOps: a, classBOps: b };
}

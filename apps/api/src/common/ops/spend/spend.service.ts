import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../../redis/redis.constants';
import { SecretsService } from '../../secrets/secrets.service';
import {
  AwsCostService,
  type AwsCostReport,
} from '../launch/aws-launch.service';
import {
  fetchBunnySpend,
  fetchR2Usage,
  fetchStripeFees,
  fetchTwilioSpend,
  type BunnySpend,
  type R2Usage,
  type StripeFees,
  type TwilioSpend,
} from '../usage/spend-clients';
import { fetchTurnEgressBytes, GB, type FetchFn } from '../usage/usage-clients';

export const SPEND_SNAPSHOT_KEY = 'ops:spend:v1';
const SNAPSHOT_TTL_SEC = 14 * 24 * 3600;
/** Cost Explorer bills $0.01 per request: at most one refresh per 6 h. */
export const AWS_MIN_INTERVAL_MS = 6 * 3600_000;
/** The other vendors' APIs are free; still not more than every 15 min. */
export const OTHER_MIN_INTERVAL_MS = 15 * 60_000;
export const SAFETY_MARGIN = 0.2;

export const PRICES_KEY = 'spend.prices';
export const FIXED_KEY = 'spend.fixed_costs';

export interface PriceDef {
  key: string;
  label: string;
  unit: string;
  value: number;
  sourceUrl: string;
  checkedAt: string;
}

/** Official list prices; every number is editable in the admin and the
 * page shows where and when it was checked. */
export const DEFAULT_PRICES: PriceDef[] = [
  {
    key: 'cf_realtime_per_gb',
    label: 'Звонки Cloudflare (TURN/SFU): цена за ГБ сверх бесплатного',
    unit: '$ за ГБ',
    value: 0.05,
    sourceUrl: 'https://developers.cloudflare.com/realtime/turn/faq/',
    checkedAt: '2026-10-24',
  },
  {
    key: 'cf_realtime_free_gb',
    label: 'Звонки Cloudflare: бесплатно в месяц (общее для TURN и SFU)',
    unit: 'ГБ',
    value: 1000,
    sourceUrl: 'https://developers.cloudflare.com/realtime/turn/faq/',
    checkedAt: '2026-10-24',
  },
  {
    key: 'r2_storage_per_gb',
    label: 'Cloudflare R2: хранение',
    unit: '$ за ГБ в месяц',
    value: 0.015,
    sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
    checkedAt: '2026-10-24',
  },
  {
    key: 'r2_storage_free_gb',
    label: 'Cloudflare R2: бесплатное хранение',
    unit: 'ГБ',
    value: 10,
    sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
    checkedAt: '2026-10-24',
  },
  {
    key: 'r2_class_a_per_million',
    label: 'Cloudflare R2: операции записи и списков (класс A)',
    unit: '$ за миллион',
    value: 4.5,
    sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
    checkedAt: '2026-10-24',
  },
  {
    key: 'r2_class_a_free_million',
    label: 'Cloudflare R2: бесплатные операции класса A',
    unit: 'млн в месяц',
    value: 1,
    sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
    checkedAt: '2026-10-24',
  },
  {
    key: 'r2_class_b_per_million',
    label: 'Cloudflare R2: операции чтения (класс B)',
    unit: '$ за миллион',
    value: 0.36,
    sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
    checkedAt: '2026-10-24',
  },
  {
    key: 'r2_class_b_free_million',
    label: 'Cloudflare R2: бесплатные операции класса B',
    unit: 'млн в месяц',
    value: 10,
    sourceUrl: 'https://developers.cloudflare.com/r2/pricing/',
    checkedAt: '2026-10-24',
  },
];

export interface FixedCost {
  id: string;
  label: string;
  usd: number;
  /** month: every month; year: spread over 12; once: counted in paidMonth. */
  period: 'month' | 'year' | 'once';
  /** YYYY-MM, for `once`. */
  paidMonth?: string | null;
}

/** What a fixed cost adds to the month [ym] (YYYY-MM). */
export function fixedMonthly(f: FixedCost, ym: string): number {
  if (f.period === 'month') return f.usd;
  if (f.period === 'year') return f.usd / 12;
  return f.paidMonth === ym ? f.usd : 0;
}

export interface DayUsd {
  date: string;
  usd: number;
}

export interface VendorSpend {
  id: 'aws' | 'twilio' | 'bunny' | 'cloudflare' | 'stripe';
  label: string;
  /** ok: fresh; stale: the last answer failed, old numbers shown; nodata. */
  status: 'ok' | 'stale' | 'nodata';
  error: string | null;
  updatedAt: string | null;
  monthToDateUsd: number | null;
  lastMonthUsd: number | null;
  forecastUsd: number | null;
  coveredByCreditsUsd: number | null;
  balanceUsd: number | null;
  daily: DayUsd[];
  lines: { label: string; usd: number; note: string | null }[];
  freeTier: { label: string; used: number; free: number; unit: string } | null;
  notes: string[];
}

/** What is stored between polls: raw numbers, no prices applied. */
export interface RawSpend {
  at: string;
  aws?: Entry<AwsCostReport>;
  twilio?: Entry<TwilioSpend>;
  bunny?: Entry<BunnySpend>;
  stripe?: Entry<StripeFees>;
  cloudflare?: Entry<{
    egressGb: number | null;
    r2: R2Usage | null;
    r2Error: string | null;
  }>;
}

interface Entry<T> {
  /** Last good answer. */
  data?: T;
  /** When `data` was fetched. */
  at?: string;
  /** Why the latest try failed (cleared on success). */
  error?: string;
  /** When we last tried. */
  triedAt: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

function daysInMonth(now: Date): { day: number; total: number } {
  return {
    day: now.getUTCDate(),
    total: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate(),
  };
}

/** Straight-line guess for the whole month. */
export function linearForecast(mtd: number, now: Date): number {
  const { day, total } = daysInMonth(now);
  return round2((mtd / Math.max(1, day)) * total);
}

const TWILIO_RU: Record<string, string> = {
  sms: 'SMS',
  'sms-outbound': 'SMS исходящие',
  'sms-inbound': 'SMS входящие',
  'sms-messages-carrierfees': 'Сборы операторов связи за SMS',
  carrierfees: 'Сборы операторов связи',
  phonenumbers: 'Номера телефонов',
  verify: 'Verify (проверка кодов)',
  'verify-push': 'Verify (проверка кодов)',
  calls: 'Звонки',
};

@Injectable()
export class SpendService {
  constructor(
    private readonly secrets: SecretsService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly aws: AwsCostService,
    @Optional() private readonly logger?: PinoLogger,
  ) {
    this.logger?.setContext(SpendService.name);
  }

  // --- settings (prices, fixed costs) -------------------------------------

  async prices(): Promise<
    (PriceDef & { edited: boolean; defaultValue: number })[]
  > {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: PRICES_KEY },
    });
    const saved = (row?.value ?? {}) as Record<
      string,
      { value?: number; checkedAt?: string }
    >;
    return DEFAULT_PRICES.map((d) => {
      const s = saved[d.key];
      const ok = typeof s?.value === 'number' && s.value >= 0;
      return {
        ...d,
        value: ok ? s.value! : d.value,
        checkedAt: ok && s?.checkedAt ? s.checkedAt : d.checkedAt,
        edited: ok,
        defaultValue: d.value,
      };
    });
  }

  async fixedCosts(): Promise<FixedCost[]> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: FIXED_KEY },
    });
    return Array.isArray(row?.value)
      ? (row.value as unknown as FixedCost[])
      : [];
  }

  // --- poll ---------------------------------------------------------------

  async raw(): Promise<RawSpend | null> {
    try {
      const s = await this.redis.get(SPEND_SNAPSHOT_KEY);
      return s ? (JSON.parse(s) as RawSpend) : null;
    } catch {
      return null;
    }
  }

  /**
   * Asks every vendor whose last try is old enough. Called by the daily
   * `ops.usage-poll` job and by the admin «Обновить» button. A vendor that
   * fails keeps its last good numbers; nothing here throws.
   */
  async refresh(now: Date = new Date(), fetchFn?: FetchFn): Promise<RawSpend> {
    const prev = (await this.raw()) ?? { at: now.toISOString() };
    const next: RawSpend = { ...prev, at: now.toISOString() };
    const due = (e: Entry<unknown> | undefined, minMs: number) =>
      !e || now.getTime() - Date.parse(e.triedAt) >= minMs;

    if (due(prev.aws, AWS_MIN_INTERVAL_MS) && this.onAws()) {
      next.aws = await this.attempt(prev.aws, now, 'aws', () =>
        this.aws.report(now),
      );
    }
    const tw = await this.secrets.get('twilio');
    if (
      tw?.fields.accountSid &&
      tw.fields.authToken &&
      due(prev.twilio, OTHER_MIN_INTERVAL_MS)
    ) {
      next.twilio = await this.attempt(prev.twilio, now, 'twilio', () =>
        fetchTwilioSpend(
          tw.fields.accountSid,
          tw.fields.authToken,
          now,
          fetchFn,
        ),
      );
    }
    const bn = await this.secrets.get('bunny_stream');
    const bunnyKey = (
      bn?.fields.accountApiKey ??
      this.config.get<string>('BUNNY_ACCOUNT_API_KEY') ??
      ''
    ).trim();
    if (bunnyKey && due(prev.bunny, OTHER_MIN_INTERVAL_MS)) {
      next.bunny = await this.attempt(prev.bunny, now, 'bunny', () =>
        fetchBunnySpend(bunnyKey, fetchFn),
      );
    }
    const st = await this.secrets.field('stripe', 'secretKey');
    if (st && due(prev.stripe, OTHER_MIN_INTERVAL_MS)) {
      next.stripe = await this.attempt(prev.stripe, now, 'stripe', () =>
        fetchStripeFees(st, now, fetchFn),
      );
    }
    const cf = await this.cloudflareCreds();
    if (cf && due(prev.cloudflare, OTHER_MIN_INTERVAL_MS)) {
      next.cloudflare = await this.attempt(
        prev.cloudflare,
        now,
        'cloudflare',
        async () => {
          const egress = await fetchTurnEgressBytes(
            cf.accountId,
            cf.token,
            now,
            fetchFn,
          );
          let r2: R2Usage | null = null;
          let r2Error: string | null = null;
          if (await this.secrets.has('cloudflare_r2')) {
            try {
              r2 = await fetchR2Usage(cf.accountId, cf.token, now, fetchFn);
            } catch (e) {
              r2Error = (e as Error).message;
            }
          }
          return { egressGb: egress.egressBytes / GB, r2, r2Error };
        },
      );
    }
    await this.redis
      .set(SPEND_SNAPSHOT_KEY, JSON.stringify(next), 'EX', SNAPSHOT_TTL_SEC)
      .catch(() => undefined);
    return next;
  }

  private onAws(): boolean {
    return !!this.config.get<string>('OPS_AWS_ACCOUNT_ID');
  }

  private async cloudflareCreds(): Promise<{
    accountId: string;
    token: string;
  } | null> {
    const f = (await this.secrets.get('cloudflare_turn'))?.fields ?? {};
    const accountId = (
      f.accountId ??
      this.config.get<string>('CLOUDFLARE_ANALYTICS_ACCOUNT_ID') ??
      ''
    ).trim();
    const token = (
      f.analyticsToken ??
      this.config.get<string>('CLOUDFLARE_ANALYTICS_API_TOKEN') ??
      ''
    ).trim();
    return accountId && token ? { accountId, token } : null;
  }

  private async attempt<T>(
    old: Entry<T> | undefined,
    now: Date,
    vendor: string,
    run: () => Promise<T>,
  ): Promise<Entry<T>> {
    try {
      const data = await run();
      return { data, at: now.toISOString(), triedAt: now.toISOString() };
    } catch (e) {
      const error = (e as Error).message.slice(0, 200);
      this.logger?.warn(
        { alert: 'spend_poll_failed', vendor, err: error },
        'Spend poll failed',
      );
      return { ...old, error, triedAt: now.toISOString() };
    }
  }

  // --- report -------------------------------------------------------------

  async report(now: Date = new Date()) {
    const [raw, prices, fixed] = await Promise.all([
      this.raw(),
      this.prices(),
      this.fixedCosts(),
    ]);
    const vendors = buildVendors(raw, prices, now);
    const ym = now.toISOString().slice(0, 7);
    const fixedMonth = round2(
      fixed.reduce((s, f) => s + fixedMonthly(f, ym), 0),
    );
    const bills = vendors.filter((v) => v.id !== 'stripe');
    const billsMtd = round2(
      bills.reduce((s, v) => s + (v.monthToDateUsd ?? 0), 0) + fixedMonth,
    );
    const billsForecast = round2(
      bills.reduce((s, v) => s + (v.forecastUsd ?? v.monthToDateUsd ?? 0), 0) +
        fixedMonth,
    );
    return {
      generatedAt: now.toISOString(),
      refreshedAt: raw?.at ?? null,
      vendors,
      fixed: fixed.map((f) => ({
        ...f,
        monthlyUsd: round2(fixedMonthly(f, ym)),
      })),
      prices,
      total: {
        monthToDateUsd: billsMtd,
        forecastUsd: billsForecast,
        marginPercent: SAFETY_MARGIN * 100,
        keepOnAccountUsd: round2(billsForecast * (1 + SAFETY_MARGIN)),
        fixedMonthUsd: fixedMonth,
        stripeFeesUsd:
          vendors.find((v) => v.id === 'stripe')?.monthToDateUsd ?? null,
      },
    };
  }
}

type PriceMap = Record<string, number>;

function entryStatus<T>(e: Entry<T> | undefined): 'ok' | 'stale' | 'nodata' {
  if (!e?.data) return 'nodata';
  return e.error ? 'stale' : 'ok';
}

function base(
  id: VendorSpend['id'],
  label: string,
  e: Entry<unknown> | undefined,
): VendorSpend {
  return {
    id,
    label,
    status: entryStatus(e),
    error: e?.error ?? null,
    updatedAt: e?.at ?? null,
    monthToDateUsd: null,
    lastMonthUsd: null,
    forecastUsd: null,
    coveredByCreditsUsd: null,
    balanceUsd: null,
    daily: [],
    lines: [],
    freeTier: null,
    notes: [],
  };
}

/** Pure: raw polls + prices → what the page shows. */
export function buildVendors(
  raw: RawSpend | null,
  priceList: { key: string; value: number }[],
  now: Date,
): VendorSpend[] {
  const p: PriceMap = Object.fromEntries(
    priceList.map((x) => [x.key, x.value]),
  );
  const out: VendorSpend[] = [];

  // AWS
  {
    const e = raw?.aws;
    const v = base('aws', 'AWS (серверы, база, хранение)', e);
    const d = e?.data;
    if (d) {
      const gross = d.monthToDate.gross;
      const credits = Math.min(d.monthToDate.credits, gross);
      v.monthToDateUsd = round2(Math.max(0, gross - credits));
      v.coveredByCreditsUsd = round2(credits);
      v.lastMonthUsd = round2(
        Math.max(
          0,
          d.lastMonth.gross - Math.min(d.lastMonth.credits, d.lastMonth.gross),
        ),
      );
      const grossForecast =
        d.forecastRestGross === null
          ? linearForecast(gross, now)
          : gross + d.forecastRestGross;
      const share = gross > 0 ? Math.min(1, credits / gross) : 0;
      v.forecastUsd = round2(grossForecast * (1 - share));
      v.daily = d.daily.map((x) => ({
        date: x.date,
        usd: round2(Math.max(0, x.gross - x.credits)),
      }));
      v.lines = d.byService.slice(0, 12).map((s) => ({
        label: s.service,
        usd: round2(s.gross),
        note:
          s.credits > 0.005
            ? `покрыто кредитами: ${round2(s.credits)} $`
            : null,
      }));
      if (credits > 0.005) {
        v.notes.push(
          `Покрыто кредитами AWS: ${round2(credits)} $ из ${round2(gross)} $. Из своего кармана за месяц пока ${v.monthToDateUsd} $.`,
        );
      }
      if (d.forecastRestGross === null) {
        v.notes.push(
          'Прогноз AWS пока считается по прямой: у аккаунта мало истории.',
        );
      }
    }
    out.push(v);
  }

  // Twilio
  {
    const e = raw?.twilio;
    const v = base('twilio', 'Twilio (SMS-коды)', e);
    const d = e?.data;
    if (d) {
      v.monthToDateUsd = round2(d.thisMonth.total);
      v.lastMonthUsd = round2(d.lastMonth.total);
      v.forecastUsd = linearForecast(d.thisMonth.total, now);
      v.balanceUsd = d.balanceUsd;
      v.daily = d.daily;
      v.lines = d.thisMonth.byCategory.map((c) => ({
        label: TWILIO_RU[c.category] ?? c.category,
        usd: round2(c.usd),
        note: null,
      }));
    }
    out.push(v);
  }

  // Bunny
  {
    const e = raw?.bunny;
    const v = base('bunny', 'Bunny (видео)', e);
    const d = e?.data;
    if (d) {
      v.monthToDateUsd =
        d.thisMonthUsd === null ? null : round2(d.thisMonthUsd);
      v.forecastUsd =
        d.thisMonthUsd === null ? null : linearForecast(d.thisMonthUsd, now);
      v.balanceUsd = d.balanceUsd;
      v.notes.push(
        'Прошлый месяц и график по дням Bunny через ключ аккаунта не отдаёт.',
      );
    }
    out.push(v);
  }

  // Cloudflare: calls (TURN+SFU egress) + R2
  {
    const e = raw?.cloudflare;
    const v = base('cloudflare', 'Cloudflare (звонки и фото)', e);
    const d = e?.data;
    if (d) {
      const lines: VendorSpend['lines'] = [];
      let total = 0;
      if (d.egressGb !== null) {
        const over = Math.max(0, d.egressGb - (p.cf_realtime_free_gb ?? 1000));
        const usd = over * (p.cf_realtime_per_gb ?? 0.05);
        total += usd;
        lines.push({
          label: 'Звонки: трафик сверх бесплатного',
          usd: round2(usd),
          note: `${round2(d.egressGb)} ГБ за месяц`,
        });
        v.freeTier = {
          label: 'Бесплатный трафик звонков',
          used: round2(d.egressGb),
          free: p.cf_realtime_free_gb ?? 1000,
          unit: 'ГБ',
        };
        v.notes.push(
          'Считается только трафик TURN: трафик SFU (групповые видеозвонки) в статистике не виден, цифра может быть чуть выше.',
        );
      }
      if (d.r2) {
        const st =
          Math.max(0, d.r2.storageGb - (p.r2_storage_free_gb ?? 10)) *
          (p.r2_storage_per_gb ?? 0.015);
        const a =
          Math.max(0, d.r2.classAOps / 1e6 - (p.r2_class_a_free_million ?? 1)) *
          (p.r2_class_a_per_million ?? 4.5);
        const b =
          Math.max(
            0,
            d.r2.classBOps / 1e6 - (p.r2_class_b_free_million ?? 10),
          ) * (p.r2_class_b_per_million ?? 0.36);
        total += st + a + b;
        lines.push(
          {
            label: 'Фото и медиа (R2): хранение',
            usd: round2(st),
            note: `${round2(d.r2.storageGb)} ГБ`,
          },
          {
            label: 'Фото и медиа (R2): записи',
            usd: round2(a),
            note: `${Math.round(d.r2.classAOps)} операций`,
          },
          {
            label: 'Фото и медиа (R2): чтения',
            usd: round2(b),
            note: `${Math.round(d.r2.classBOps)} операций`,
          },
        );
      } else if (d.r2Error) {
        v.notes.push(`R2: нет данных (${d.r2Error}).`);
      }
      v.lines = lines;
      v.monthToDateUsd = round2(total);
      v.forecastUsd = linearForecast(total, now);
      v.notes.push(
        'Цены лежат в настройках внизу страницы: у каждой указаны источник и дата проверки.',
      );
    }
    out.push(v);
  }

  // Stripe (a cut of your revenue, not a bill)
  {
    const e = raw?.stripe;
    const v = base('stripe', 'Stripe (комиссия с платежей)', e);
    const d = e?.data;
    if (d) {
      v.monthToDateUsd = round2(d.thisMonthUsd);
      v.lastMonthUsd = round2(d.lastMonthUsd);
      v.forecastUsd = linearForecast(d.thisMonthUsd, now);
      v.daily = d.daily;
      v.notes.push(
        'Это не счёт: Stripe сам удерживает комиссию из платежей клиентов. В сумму «держать на счету» не входит.',
      );
      if (d.truncated)
        v.notes.push(
          'Платежей очень много: прочитана только часть, сумма не меньше показанной.',
        );
      if (d.skippedCurrencies.length > 0)
        v.notes.push(
          `Не посчитаны комиссии в других валютах: ${d.skippedCurrencies.join(', ')}.`,
        );
    }
    out.push(v);
  }
  return out;
}

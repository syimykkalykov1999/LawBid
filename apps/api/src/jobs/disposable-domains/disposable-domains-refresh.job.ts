import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../../prisma/prisma.service';
import { DISPOSABLE_DOMAINS_FETCHER } from '../jobs.constants';
import type { DisposableDomainsFetcher } from './disposable-domains.fetcher';

export const DISPOSABLE_REASON = 'disposable';

/** Sanity bounds for a fetched list. The open list has a few thousand
 * entries; far fewer means a truncated/wrong file, far more means it is
 * not that list. */
export const DISPOSABLE_MIN_DOMAINS = 1_000;
export const DISPOSABLE_MAX_DOMAINS = 200_000;
/** More than this share of non-domain lines = not a domain list (an HTML
 * error page, a moved file...). A few odd lines are skipped. */
export const DISPOSABLE_MAX_INVALID_RATIO = 0.01;
/** Refuse a list that would drop more than half of the current entries. */
export const DISPOSABLE_MAX_SHRINK_RATIO = 0.5;

const WRITE_CHUNK = 1_000;

// Lowercase hostname: dot-separated LDH labels (1-63 chars, no leading or
// trailing hyphen), at least two labels, alphabetic or punycode TLD.
const DOMAIN_RE =
  /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

export interface ParsedDomainList {
  domains: string[];
  invalid: number;
}

/** Parses the plain-text list: one domain per line, `#` comments, blank
 * lines ignored, lowercased, de-duplicated, sorted. */
export function parseDomainList(text: string): ParsedDomainList {
  const seen = new Set<string>();
  let invalid = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim().toLowerCase();
    if (line.length === 0) continue;
    if (DOMAIN_RE.test(line)) seen.add(line);
    else invalid += 1;
  }
  return { domains: [...seen].sort(), invalid };
}

export type DisposableRefreshResult =
  | { status: 'updated'; added: number; removed: number; total: number }
  | { status: 'skipped'; reason: string };

/**
 * docs/02_DATABASE.md §3.3: `blocked_email_domains` holds
 * `privaterelay.appleid.com` (`apple_relay`) and the disposable-domain
 * list (`disposable`), "загружается из ... открытый список, обновляется
 * джобой раз в месяц".
 *
 * Fail-safe: any fetch or validation problem logs a warning and leaves the
 * table exactly as it was. Only `reason = 'disposable'` rows are ever
 * inserted or deleted — a domain already present under another reason
 * (apple_relay, or anything added later) is never overwritten or removed.
 * Idempotent (insert ON CONFLICT DO NOTHING + delete of the stale set) and
 * chunked into short statements (docs/02 §1.1), so a crash midway leaves a
 * valid table that the next run completes.
 */
@Injectable()
export class DisposableDomainsRefreshJob {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(DISPOSABLE_DOMAINS_FETCHER)
    private readonly fetcher: DisposableDomainsFetcher,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DisposableDomainsRefreshJob.name);
  }

  async run(): Promise<DisposableRefreshResult> {
    const url = this.config.getOrThrow<string>('DISPOSABLE_DOMAINS_URL');

    let text: string;
    try {
      text = await this.fetcher.fetch(url);
    } catch (error) {
      return this.skip('fetch_failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const { domains, invalid } = parseDomainList(text);
    const lines = domains.length + invalid;
    if (lines > 0 && invalid / lines > DISPOSABLE_MAX_INVALID_RATIO) {
      return this.skip('too_many_invalid_lines', { invalid, lines });
    }
    if (domains.length < DISPOSABLE_MIN_DOMAINS) {
      return this.skip('too_few_domains', { count: domains.length });
    }
    if (domains.length > DISPOSABLE_MAX_DOMAINS) {
      return this.skip('too_many_domains', { count: domains.length });
    }

    const current = await this.prisma.blockedEmailDomain.findMany({
      select: { domain: true, reason: true },
    });
    const currentDisposable = new Set(
      current
        .filter((r) => r.reason === DISPOSABLE_REASON)
        .map((r) => r.domain),
    );
    const protectedDomains = new Set(
      current
        .filter((r) => r.reason !== DISPOSABLE_REASON)
        .map((r) => r.domain),
    );

    const wanted = domains.filter((d) => !protectedDomains.has(d));
    const wantedSet = new Set(wanted);
    if (
      currentDisposable.size >= DISPOSABLE_MIN_DOMAINS &&
      wanted.length < currentDisposable.size * DISPOSABLE_MAX_SHRINK_RATIO
    ) {
      return this.skip('shrinks_too_much', {
        current: currentDisposable.size,
        fetched: wanted.length,
      });
    }

    const toAdd = wanted.filter((d) => !currentDisposable.has(d));
    const toRemove = [...currentDisposable].filter((d) => !wantedSet.has(d));

    let added = 0;
    for (let i = 0; i < toAdd.length; i += WRITE_CHUNK) {
      const res = await this.prisma.blockedEmailDomain.createMany({
        data: toAdd
          .slice(i, i + WRITE_CHUNK)
          .map((domain) => ({ domain, reason: DISPOSABLE_REASON })),
        skipDuplicates: true,
      });
      added += res.count;
    }
    let removed = 0;
    for (let i = 0; i < toRemove.length; i += WRITE_CHUNK) {
      const res = await this.prisma.blockedEmailDomain.deleteMany({
        where: {
          reason: DISPOSABLE_REASON,
          domain: { in: toRemove.slice(i, i + WRITE_CHUNK) },
        },
      });
      removed += res.count;
    }

    const result = {
      status: 'updated' as const,
      added,
      removed,
      total: wanted.length,
    };
    this.logger.info(
      { added, removed, total: wanted.length, invalid },
      'disposable domains refreshed',
    );
    return result;
  }

  private skip(
    reason: string,
    details: Record<string, unknown>,
  ): DisposableRefreshResult {
    this.logger.warn(
      { reason, ...details },
      'disposable domains refresh skipped; keeping current list',
    );
    return { status: 'skipped', reason };
  }
}

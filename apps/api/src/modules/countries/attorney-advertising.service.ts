import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { needsResultsDisclaimer } from '../attorney-ads/ad-rules';
import {
  ATTORNEY_ADS_SETTINGS_KEY,
  mergeRules,
  parseAttorneyAdsSettings,
  type AttorneyAdsSettings,
} from '../attorney-ads/attorney-ads.settings';
import { attorneysWithEntitlementSql } from '../plans/entitlements.service';

const CACHE_MS = 60_000;
/** Most attorneys whose paid-placement flags one process remembers. */
const PLACEMENT_CACHE_MAX = 2000;

/**
 * Owner 2026-10-22 (audit #4 §5): New York Rule 7.1(f) (and any state the
 * owner switches on in Страны → регионы) requires attorney advertising to
 * carry the words «Attorney Advertising». An attorney licensed in such a
 * state gets `advertisingLabel: true` on the profile and on every post;
 * the app renders the label. The rule follows the bar admission, so any
 * verified licence in a labelled state turns it on.
 *
 * Owner 2026-10-28: NY dropped the mandatory label and the "prior
 * results" wording from 7.1 on 2026-06-01, but other states keep them, so
 * the switches stay. New: (a) `attorney_ads.settings.paidPlacementLabel`
 * makes paid placement (plan «higher in search», an active promotion)
 * always carry the label; (b) the server adds the per-state results
 * disclaimer to ad text that quotes results or testimonials.
 */
@Injectable()
export class AttorneyAdvertisingService {
  private cache?: { at: number; states: Set<string> };
  private adsCache?: { at: number; value: AttorneyAdsSettings };
  /** Review R-72: paid-placement flags per attorney (one row, 60 s). The
   * generation is the version stamp: `invalidate()` bumps it, so an admin
   * change never serves a flag cached under the old rules. */
  private placementGen = 0;
  private readonly placementCache = new Map<
    string,
    { at: number; gen: number; sponsored: boolean; paid: boolean }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Region codes with the label on (60 s per process). */
  async labelStates(): Promise<Set<string>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.states;
    }
    const rows = await this.prisma.state.findMany({
      where: { attorney_advertising_label: true },
      select: { code: true },
    });
    const states = new Set(rows.map((r) => r.code));
    this.cache = { at: Date.now(), states };
    return states;
  }

  private async adsSettings(): Promise<AttorneyAdsSettings> {
    if (this.adsCache && Date.now() - this.adsCache.at < CACHE_MS) {
      return this.adsCache.value;
    }
    const row = await this.prisma.appConfig.findUnique({
      where: { key: ATTORNEY_ADS_SETTINGS_KEY },
    });
    const value = parseAttorneyAdsSettings(row?.value);
    this.adsCache = { at: Date.now(), value };
    return value;
  }

  /** An admin toggled a state / the ad rules: the next read reloads. */
  invalidate(): void {
    this.cache = undefined;
    this.adsCache = undefined;
    this.placementGen += 1;
    this.placementCache.clear();
  }

  /** True when any of [stateCodes] requires the label. */
  async requiresLabel(stateCodes: Iterable<string>): Promise<boolean> {
    const states = await this.labelStates();
    for (const c of stateCodes) if (states.has(c)) return true;
    return false;
  }

  /** The attorneys among [ids] that sit in a paid placement right now:
   * the plan term «higher in search» or an active promotion. Empty (and
   * free) while `paidPlacementLabel` is off. */
  async paidPlacement(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0 || !(await this.adsSettings()).paidPlacementLabel) {
      return new Set();
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT u.id::TEXT AS id
      FROM unnest(${ids}::uuid[]) AS u(id)
      WHERE ${attorneysWithEntitlementSql('priority_search', Prisma.sql`u.id`)}
         OR EXISTS (SELECT 1 FROM case_promotions cp
                    WHERE cp.user_id = u.id AND cp.status = 'active'
                      AND cp.ends_at > now())`);
    return new Set(rows.map((r) => r.id));
  }

  /** Owner 2026-10-28: attorneys that hold paid priority in search (the
   * plan term «higher in search»). Always on — paid ranking is never
   * shown unlabelled («Sponsored»), whatever the other switches say. */
  async sponsored(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT u.id::TEXT AS id
      FROM unnest(${ids}::uuid[]) AS u(id)
      WHERE ${attorneysWithEntitlementSql('priority_search', Prisma.sql`u.id`)}`);
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Both profile flags for one attorney from ONE cached query (a profile
   * view used to run the entitlement subquery twice, uncached): `sponsored`
   * (always on) and `advertisingLabel` (labelled state, or paid placement
   * while `paidPlacementLabel` is on).
   */
  async profileFlags(
    attorneyId: string,
    stateCodes: Iterable<string>,
  ): Promise<{ advertisingLabel: boolean; sponsored: boolean }> {
    const hit = this.placementCache.get(attorneyId);
    let flags =
      hit && hit.gen === this.placementGen && Date.now() - hit.at < CACHE_MS
        ? hit
        : undefined;
    if (!flags) {
      const gen = this.placementGen;
      const rows = await this.prisma.$queryRaw<
        { sponsored: boolean; paid: boolean }[]
      >(Prisma.sql`
        SELECT ${attorneysWithEntitlementSql('priority_search', Prisma.sql`${attorneyId}::uuid`)} AS sponsored,
               (${attorneysWithEntitlementSql('priority_search', Prisma.sql`${attorneyId}::uuid`)}
                OR EXISTS (SELECT 1 FROM case_promotions cp
                           WHERE cp.user_id = ${attorneyId}::uuid
                             AND cp.status = 'active'
                             AND cp.ends_at > now())) AS paid`);
      flags = {
        at: Date.now(),
        gen,
        sponsored: rows[0]?.sponsored === true,
        paid: rows[0]?.paid === true,
      };
      if (gen === this.placementGen) {
        if (this.placementCache.size >= PLACEMENT_CACHE_MAX) {
          const oldest = this.placementCache.keys().next().value;
          if (oldest !== undefined) this.placementCache.delete(oldest);
        }
        this.placementCache.set(attorneyId, flags);
      }
    }
    const advertisingLabel =
      (await this.requiresLabel(stateCodes)) ||
      ((await this.adsSettings()).paidPlacementLabel && flags.paid);
    return { advertisingLabel, sponsored: flags.sponsored };
  }

  /** Label for one attorney: licensed in a labelled state, or paid. */
  async labelFor(
    attorneyId: string,
    stateCodes: Iterable<string>,
  ): Promise<boolean> {
    if (await this.requiresLabel(stateCodes)) return true;
    return (await this.paidPlacement([attorneyId])).has(attorneyId);
  }

  /** The attorneys among [attorneyIds] that must show the label (one
   * query for a whole feed page). */
  async labelledAttorneys(attorneyIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(attorneyIds)];
    if (ids.length === 0) return new Set();
    const paid = await this.paidPlacement(ids);
    const states = await this.labelStates();
    if (states.size === 0) return paid;
    const rows = await this.prisma.attorneyLicense.findMany({
      where: {
        attorney_id: { in: ids },
        state_code: { in: [...states] },
        license_status: 'verified',
      },
      select: { attorney_id: true },
      distinct: ['attorney_id'],
    });
    return new Set([...paid, ...rows.map((r) => r.attorney_id)]);
  }

  /**
   * For each attorney whose states ask for the results disclaimer, the
   * disclaimer text. Empty map while no state has `disclaimers` on (one
   * cached settings read, no query).
   */
  async resultsDisclaimers(
    attorneyIds: string[],
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = [...new Set(attorneyIds)];
    if (ids.length === 0) return out;
    const s = await this.adsSettings();
    const anyOn =
      s.defaults.disclaimers ||
      Object.values(s.states).some((r) => r.disclaimers === true);
    if (!anyOn) return out;
    const rows = await this.prisma.attorneyLicense.findMany({
      where: { attorney_id: { in: ids }, license_status: 'verified' },
      select: { attorney_id: true, state_code: true },
    });
    const byAttorney = new Map<string, string[]>();
    for (const r of rows) {
      const list = byAttorney.get(r.attorney_id) ?? [];
      list.push(r.state_code);
      byAttorney.set(r.attorney_id, list);
    }
    for (const id of ids) {
      const rules = mergeRules(s, byAttorney.get(id) ?? []);
      if (rules.disclaimers) out.set(id, rules.resultsDisclaimer);
    }
    return out;
  }

  /** The disclaimer to show under [text], or null. */
  disclaimerFor(
    disclaimers: Map<string, string>,
    attorneyId: string,
    text: string,
  ): string | null {
    const d = disclaimers.get(attorneyId);
    return d && needsResultsDisclaimer(text) ? d : null;
  }
}

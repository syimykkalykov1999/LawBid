import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_MS = 60_000;

/**
 * Owner 2026-10-22 (audit #4 §5): New York Rule 7.1(f) (and any state the
 * owner switches on in Страны → регионы) requires attorney advertising to
 * carry the words «Attorney Advertising». An attorney licensed in such a
 * state gets `advertisingLabel: true` on the profile and on every post;
 * the app renders the label. The rule follows the bar admission, so any
 * verified licence in a labelled state turns it on.
 */
@Injectable()
export class AttorneyAdvertisingService {
  private cache?: { at: number; states: Set<string> };

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

  /** An admin toggled a state: the next read reloads. */
  invalidate(): void {
    this.cache = undefined;
  }

  /** True when any of [stateCodes] requires the label. */
  async requiresLabel(stateCodes: Iterable<string>): Promise<boolean> {
    const states = await this.labelStates();
    for (const c of stateCodes) if (states.has(c)) return true;
    return false;
  }

  /** The attorneys among [attorneyIds] that must show the label (one
   * query for a whole feed page). */
  async labelledAttorneys(attorneyIds: string[]): Promise<Set<string>> {
    const ids = [...new Set(attorneyIds)];
    if (ids.length === 0) return new Set();
    const states = await this.labelStates();
    if (states.size === 0) return new Set();
    const rows = await this.prisma.attorneyLicense.findMany({
      where: {
        attorney_id: { in: ids },
        state_code: { in: [...states] },
        license_status: 'verified',
      },
      select: { attorney_id: true },
      distinct: ['attorney_id'],
    });
    return new Set(rows.map((r) => r.attorney_id));
  }
}

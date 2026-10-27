/**
 * Owner 2026-10-27: how much one reporter's report counts towards an
 * automatic hide. Pure functions (no I/O) so the rules are easy to test.
 *
 * The pattern follows what large platforms publish: Discourse weights a
 * flag by the flagger's trust level and recent accuracy (last 100 flags);
 * Facebook scored reporters by how often their reports were confirmed;
 * and the DSA (Art. 23) asks platforms to treat repeated unfounded
 * notices differently. Here a normal established account weighs 1.
 */
export interface WeightConfig {
  newAccountDays: number;
  newAccount: number;
  unverifiedContact: number;
  verifiedReporter: number;
  accuracyMinReports: number;
  clusterBySource: boolean;
  burstWindowHours: number;
  burstMinAccounts: number;
  burst: number;
}

export interface ReporterFacts {
  id: string;
  createdAt: Date;
  /** A verified phone or e-mail. */
  contactVerified: boolean;
  verifiedAttorney: boolean;
  /** Reports of this person moderators upheld / dismissed (last 100). */
  upheld: number;
  rejected: number;
  /** Report processing is paused for this person. */
  paused: boolean;
  /** Recent sign-in sources: `ip:<addr>` and `dev:<device id>`. */
  sources: string[];
}

export interface WeightResult {
  total: number;
  weights: Record<string, number>;
  /** Short reasons per reporter (for the admin explanation). */
  notes: Record<string, string[]>;
}

const HOUR_MS = 3600 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** No single reporter counts for more than this. */
export const MAX_REPORTER_WEIGHT = 1.5;

/** Laplace-smoothed share of upheld reports → a 0.1..1.25 multiplier
 * (no history = 1). */
export function accuracyFactor(upheld: number, rejected: number): number {
  const acc = (upheld + 1) / (upheld + rejected + 2);
  return Math.min(1.25, Math.max(0.1, 2 * acc));
}

export function computeReportWeights(
  reporters: ReporterFacts[],
  authorSources: string[],
  now: Date,
  cfg: WeightConfig,
): WeightResult {
  const weights: Record<string, number> = {};
  const notes: Record<string, string[]> = {};
  const author = new Set(authorSources);

  // Sign-up bursts: several accounts created within one window.
  const windowMs = cfg.burstWindowHours * HOUR_MS;
  const burst = new Set<string>();
  if (cfg.burstMinAccounts > 1 && windowMs > 0) {
    for (const r of reporters) {
      const near = reporters.filter(
        (o) =>
          Math.abs(o.createdAt.getTime() - r.createdAt.getTime()) <= windowMs,
      ).length;
      if (near >= cfg.burstMinAccounts) burst.add(r.id);
    }
  }

  for (const r of reporters) {
    const n: string[] = [];
    let w = 1;
    if (r.paused) {
      weights[r.id] = 0;
      notes[r.id] = ['reporting paused'];
      continue;
    }
    if (now.getTime() - r.createdAt.getTime() < cfg.newAccountDays * DAY_MS) {
      w *= cfg.newAccount;
      n.push('new account');
    }
    if (!r.contactVerified) {
      w *= cfg.unverifiedContact;
      n.push('contact not verified');
    }
    if (r.verifiedAttorney) {
      w *= cfg.verifiedReporter;
      n.push('verified attorney');
    }
    if (r.upheld + r.rejected >= cfg.accuracyMinReports) {
      const f = accuracyFactor(r.upheld, r.rejected);
      w *= f;
      n.push(`accuracy ${r.upheld}/${r.upheld + r.rejected}`);
    }
    if (burst.has(r.id)) {
      w *= cfg.burst;
      n.push('sign-up burst');
    }
    if (cfg.clusterBySource) {
      // The author's own device: this is the author (or a friend) reporting.
      if (r.sources.some((s) => s.startsWith('dev:') && author.has(s))) {
        w = 0;
        n.push('same device as the author');
      } else if (r.sources.some((s) => author.has(s))) {
        w *= 0.5;
        n.push('same network as the author');
      }
    }
    weights[r.id] = Math.min(MAX_REPORTER_WEIGHT, Math.max(0, w));
    notes[r.id] = n;
  }

  // Reporters that share an IP or a device are one source: only the
  // heaviest of them counts.
  if (cfg.clusterBySource) {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      let p = parent.get(x) ?? x;
      while (p !== (parent.get(p) ?? p)) p = parent.get(p) ?? p;
      parent.set(x, p);
      return p;
    };
    const union = (a: string, b: string) => parent.set(find(a), find(b));
    const bySource = new Map<string, string>();
    for (const r of reporters) {
      parent.set(r.id, parent.get(r.id) ?? r.id);
      for (const s of new Set(r.sources)) {
        const seen = bySource.get(s);
        if (seen) union(r.id, seen);
        else bySource.set(s, r.id);
      }
    }
    const best = new Map<string, string>();
    for (const r of reporters) {
      const root = find(r.id);
      const cur = best.get(root);
      if (!cur || (weights[r.id] ?? 0) > (weights[cur] ?? 0)) {
        best.set(root, r.id);
      }
    }
    for (const r of reporters) {
      if (best.get(find(r.id)) !== r.id) {
        weights[r.id] = 0;
        notes[r.id] = [
          ...(notes[r.id] ?? []),
          'same device or network as another reporter',
        ];
      }
    }
  }

  let total = 0;
  for (const id of Object.keys(weights)) total += weights[id] ?? 0;
  return { total: Math.round(total * 1000) / 1000, weights, notes };
}

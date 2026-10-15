import {
  Inject,
  Injectable,
  Logger,
  Optional,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { parseSearchQuery } from '../../common/search/search-query';
import { PrismaService } from '../../prisma/prisma.service';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { SYNONYMS_SEED } from './synonyms.seed';

/** Bumped on every dictionary change; part of the ranked-results cache key,
 * so an edit shows in results at once, not after the five-minute cache. */
export const SYNONYMS_VERSION_KEY = 'search:syn:v';

/** The dictionary is small: it is kept in memory and re-read this often,
 * so an admin's edit is live within the minute without a release. */
const TTL_MS = 60_000;
/** Longest phrase looked up inside a query ("развод с мужем сегодня"). */
const MAX_GRAM = 4;
/** A word shorter than this never matches by itself or as a prefix. */
const MIN_WORD = 3;
const MAX_GROUPS = 4;
/** Cases filed here have no topic of their own: the text decides. */
const GENERIC_PRACTICE = 'general_practice.not_sure_or_other';

export interface SynonymMatch {
  /** Groups the query named (admin's debug view). */
  groupKeys: string[];
  /** Practice areas (with their subcategories) those groups point at, plus
   * the topics learned from clicks. */
  practiceIds: string[];
}

interface Snapshot {
  at: number;
  /** The dictionary version this was read at (see SYNONYMS_VERSION_KEY). */
  ver: string;
  /** normalized term → group ids */
  byTerm: Map<string, string[]>;
  /** [normalized term, group id] for the "typing a prefix" scan. */
  terms: [string, string][];
  groups: Map<string, { key: string; practiceId: string | null }>;
  /** practice id → itself and its subcategories */
  tree: Map<string, string[]>;
  learned: Map<string, string[]>;
}

export interface SeedGroup {
  key: string;
  practice?: string;
  terms: Record<string, string[]>;
}

export interface ImportResult {
  groupsCreated: number;
  groupsUpdated: number;
  termsAdded: number;
  unknownPractices: string[];
}

export interface TermInput {
  lang: string;
  term: string;
}

/** One phrase as it is stored: trimmed, one space, no case. */
export function cleanTerm(t: TermInput): TermInput | null {
  const term = t.term
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return normalizeTerm(term).length >= 2
    ? { lang: t.lang.toLowerCase(), term }
    : null;
}

export function uniqueTerms(list: TermInput[]): TermInput[] {
  const seen = new Set<string>();
  const out: TermInput[] = [];
  for (const t of list) {
    const c = cleanTerm(t);
    if (!c) continue;
    const k = `${c.lang}\n${c.term}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** How a term or a query is compared: letters and digits, lower case. */
export function normalizeTerm(raw: string): string {
  return parseSearchQuery(raw).plain;
}

/**
 * Owner 2026-10-15: search that understands everyday words. "муж бьёт",
 * "расторжение брака" and "divorce" belong to one group tied to a practice,
 * so a query naming any of them finds rows filed under that practice, in any
 * language, with no model and no outside service (one in-memory lookup).
 */
@Injectable()
export class SearchSynonymsService implements OnApplicationBootstrap {
  private readonly log = new Logger(SearchSynonymsService.name);
  private snap: Snapshot | null = null;
  private loading: Promise<Snapshot> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  /** A fresh database gets the starter dictionary once (never in tests,
   * never over an admin's own edits: only when there are no groups). */
  async onApplicationBootstrap(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    try {
      if ((await this.prisma.searchSynonymGroup.count()) > 0) return;
      const r = await this.importGroups(SYNONYMS_SEED, 'seed');
      this.log.log(
        `starter synonyms loaded: ${r.groupsCreated} groups, ${r.termsAdded} phrases`,
      );
    } catch (e) {
      this.log.warn(`starter synonyms skipped: ${String(e)}`);
    }
  }

  /** Bulk upsert: groups by key, phrases added (never removed). */
  async importGroups(
    groups: SeedGroup[],
    source: 'seed' | 'import',
  ): Promise<ImportResult> {
    const result: ImportResult = {
      groupsCreated: 0,
      groupsUpdated: 0,
      termsAdded: 0,
      unknownPractices: [],
    };
    const codes = [
      ...new Set(groups.map((g) => g.practice).filter(Boolean) as string[]),
    ];
    const known = new Map(
      (
        await this.prisma.practiceArea.findMany({
          where: { code: { in: codes } },
          select: { id: true, code: true },
        })
      ).map((p) => [p.code, p.id]),
    );
    result.unknownPractices = codes.filter((c) => !known.has(c));
    for (const g of groups) {
      const terms = uniqueTerms(
        Object.entries(g.terms).flatMap(([lang, list]) =>
          list.map((term) => ({ lang, term })),
        ),
      );
      const practiceId = g.practice ? (known.get(g.practice) ?? null) : null;
      const existing = await this.prisma.searchSynonymGroup.findUnique({
        where: { key: g.key },
        select: { id: true },
      });
      const group =
        existing ??
        (await this.prisma.searchSynonymGroup.create({
          data: { key: g.key, practice_area_id: practiceId, source },
          select: { id: true },
        }));
      if (existing) {
        result.groupsUpdated += 1;
        if (practiceId) {
          await this.prisma.searchSynonymGroup.update({
            where: { id: group.id },
            data: { practice_area_id: practiceId },
          });
        }
      } else {
        result.groupsCreated += 1;
      }
      const added = await this.prisma.searchSynonymTerm.createMany({
        data: terms.map((t) => ({ ...t, group_id: group.id })),
        skipDuplicates: true,
      });
      result.termsAdded += added.count;
    }
    this.invalidate();
    return result;
  }

  /** Admin edits call this so the next search sees them at once. */
  invalidate(): void {
    this.snap = null;
    void this.redis?.incr(SYNONYMS_VERSION_KEY).catch(() => undefined);
  }

  async resolve(rawQuery: string): Promise<SynonymMatch> {
    const empty: SynonymMatch = { groupKeys: [], practiceIds: [] };
    const phrase = normalizeTerm(rawQuery);
    if (phrase.length < MIN_WORD) return empty;
    let s: Snapshot;
    try {
      s = await this.snapshot();
    } catch {
      // The dictionary is a bonus: the plain search is always an answer.
      return empty;
    }
    const hit = new Set<string>();
    const add = (ids: string[] | undefined) => {
      for (const id of ids ?? []) hit.add(id);
    };
    // 1. The whole query is a term; 2. a term sits inside the query.
    add(s.byTerm.get(phrase));
    const words = phrase.split(' ');
    for (let n = Math.min(MAX_GRAM, words.length); n >= 1; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n).join(' ');
        if (gram.length < MIN_WORD) continue;
        add(s.byTerm.get(gram));
      }
    }
    // 3. The query is the start of a term while typing ("расторжен").
    if (hit.size === 0 && words[words.length - 1].length >= MIN_WORD + 1) {
      for (const [term, groupId] of s.terms) {
        if (term.startsWith(phrase) || term.includes(` ${phrase}`)) {
          hit.add(groupId);
          if (hit.size >= MAX_GROUPS) break;
        }
      }
    }
    const groupIds = [...hit].slice(0, MAX_GROUPS);
    const practice = new Set<string>();
    const keys: string[] = [];
    for (const id of groupIds) {
      const g = s.groups.get(id);
      if (!g) continue;
      keys.push(g.key);
      if (g.practiceId) {
        for (const p of s.tree.get(g.practiceId) ?? [g.practiceId]) {
          practice.add(p);
        }
      }
    }
    for (const id of s.learned.get(phrase) ?? []) {
      for (const p of s.tree.get(id) ?? [id]) practice.add(p);
    }
    return { groupKeys: keys, practiceIds: [...practice] };
  }

  /**
   * The topic a text names: the practice behind the most dictionary phrases
   * found in it (whole words, up to four in a row). Null when none.
   */
  async inferPractice(text: string): Promise<string | null> {
    let s: Snapshot;
    try {
      s = await this.snapshot();
    } catch {
      return null;
    }
    const words = normalizeTerm(text.slice(0, 4000)).split(' ').slice(0, 400);
    const score = new Map<string, number>();
    for (let n = MAX_GRAM; n >= 1; n--) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n).join(' ');
        if (gram.length < MIN_WORD + 1) continue;
        for (const groupId of s.byTerm.get(gram) ?? []) {
          const practiceId = s.groups.get(groupId)?.practiceId;
          if (practiceId) {
            // A longer phrase says more than a single word.
            score.set(practiceId, (score.get(practiceId) ?? 0) + n);
          }
        }
      }
    }
    let best: string | null = null;
    let top = 0;
    for (const [id, v] of score) {
      if (v > top) {
        top = v;
        best = id;
      }
    }
    return best;
  }

  /**
   * Every few minutes: posts with no topic and cases filed under "not sure /
   * other" get the topic their words name (used by search only), so a text
   * without the exact query words is still found by its topic.
   */
  async tagRecent(limit = 200): Promise<{ posts: number; cases: number }> {
    const generic = await this.prisma.practiceArea.findUnique({
      where: { code: GENERIC_PRACTICE },
      select: { id: true },
    });
    const posts = await this.prisma.$queryRaw<
      { id: string; title: string | null; body: string }[]
    >`
      SELECT id::TEXT AS id, title, body FROM posts
      WHERE topic_scanned_at IS NULL AND practice_area_id IS NULL
        AND status = 'published' AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT ${limit}`;
    for (const p of posts) {
      const topic = await this.inferPractice(`${p.title ?? ''} ${p.body}`);
      await this.prisma.$executeRaw`
        UPDATE posts SET inferred_practice_id = ${topic}::UUID,
          topic_scanned_at = now() WHERE id = ${p.id}::UUID`;
    }
    const cases = await this.prisma.$queryRaw<
      {
        id: string;
        title: string;
        description: string;
        practice_area_id: string;
      }[]
    >`
      SELECT id::TEXT AS id, title, description,
             practice_area_id::TEXT AS practice_area_id
      FROM cases
      WHERE topic_scanned_at IS NULL AND deleted_at IS NULL
      ORDER BY created_at DESC LIMIT ${limit}`;
    for (const c of cases) {
      const topic =
        generic && c.practice_area_id === generic.id
          ? await this.inferPractice(`${c.title} ${c.description}`)
          : null;
      await this.prisma.$executeRaw`
        UPDATE cases SET inferred_practice_id = ${topic}::UUID,
          topic_scanned_at = now() WHERE id = ${c.id}::UUID`;
    }
    if (posts.length || cases.length) {
      this.log.log(
        `topics tagged: ${posts.length} posts, ${cases.length} cases`,
      );
    }
    return { posts: posts.length, cases: cases.length };
  }

  private async snapshot(): Promise<Snapshot> {
    // Another instance (or the nightly job) may have changed the
    // dictionary: the shared version tells at once.
    const ver = (await this.redis?.get(SYNONYMS_VERSION_KEY)) ?? '0';
    if (
      this.snap &&
      this.snap.ver === ver &&
      Date.now() - this.snap.at < TTL_MS
    ) {
      return this.snap;
    }
    this.loading ??= this.load(ver).finally(() => {
      this.loading = null;
    });
    this.snap = await this.loading;
    return this.snap;
  }

  private async load(ver: string): Promise<Snapshot> {
    const [groups, terms, areas, learned] = await Promise.all([
      this.prisma.searchSynonymGroup.findMany({
        where: { enabled: true },
        select: { id: true, key: true, practice_area_id: true },
      }),
      this.prisma.searchSynonymTerm.findMany({
        where: { group: { enabled: true } },
        select: { group_id: true, term: true },
      }),
      this.prisma.practiceArea.findMany({
        where: { is_active: true },
        select: { id: true, parent_id: true },
      }),
      this.prisma.searchLearnedLink.findMany({
        where: { score: { gte: 1 } },
        select: { q: true, practice_area_id: true },
      }),
    ]);
    const tree = new Map<string, string[]>();
    for (const a of areas) {
      tree.set(a.id, [...(tree.get(a.id) ?? []), a.id]);
      if (a.parent_id) {
        tree.set(a.parent_id, [...(tree.get(a.parent_id) ?? []), a.id]);
      }
    }
    const byTerm = new Map<string, string[]>();
    const list: [string, string][] = [];
    for (const t of terms) {
      const norm = normalizeTerm(t.term);
      if (!norm) continue;
      byTerm.set(norm, [...(byTerm.get(norm) ?? []), t.group_id]);
      list.push([norm, t.group_id]);
    }
    const learnedMap = new Map<string, string[]>();
    for (const l of learned) {
      learnedMap.set(l.q, [...(learnedMap.get(l.q) ?? []), l.practice_area_id]);
    }
    return {
      at: Date.now(),
      ver,
      byTerm,
      terms: list,
      groups: new Map(
        groups.map((g) => [
          g.id,
          { key: g.key, practiceId: g.practice_area_id },
        ]),
      ),
      tree,
      learned: learnedMap,
    };
  }
}

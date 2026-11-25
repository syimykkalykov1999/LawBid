import 'reflect-metadata';
import type { DynamicModule, ForwardReference, Type } from '@nestjs/common';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AnalyticsCoreModule } from '../modules/analytics/analytics.module';
import { AnalyticsService } from '../modules/analytics/analytics.service';
import { OpenSearchClient } from '../modules/search/engine/opensearch.client';
import { SearchIndexerService } from '../modules/search/search-indexer.service';
import { SearchSynonymsService } from '../modules/search/search-synonyms.service';
import { SearchCoreModule } from '../modules/search/search.module';
import { S3StorageService } from '../modules/files/storage/s3-storage.service';
import { StorageCoreModule } from '../modules/storage/storage.module';
import { AppModule } from '../app.module';
import { JobsModule } from './jobs.module';
import { WorkerModule } from './worker.module';

/** The token a provider entry registers (a class or `{ provide }`). */
function tokenOf(p: unknown): unknown {
  return typeof p === 'function' ? p : (p as { provide?: unknown }).provide;
}

function nameOf(t: unknown): string {
  if (typeof t === 'function') return t.name;
  if (typeof t === 'symbol') return t.toString();
  return String(t);
}

type AnyModule =
  Type<unknown> | DynamicModule | Promise<DynamicModule> | ForwardReference;

interface Node {
  /** The class (static module) or the DynamicModule object. */
  key: unknown;
  name: string;
  providers: unknown[];
  imports: AnyModule[];
}

/** One node per module class / dynamic module object, with its providers
 * (class metadata plus the dynamic module's own list) and its imports. */
function nodeOf(m: AnyModule): Node | null {
  let raw: unknown = m;
  const fwd: (() => unknown) | undefined = (
    raw as { forwardRef?: () => unknown }
  ).forwardRef;
  if (fwd !== undefined) raw = fwd();
  if (raw === undefined || raw === null || raw instanceof Promise) return null;
  if (typeof raw === 'function') {
    const cls = raw as Type<unknown>;
    return {
      key: cls,
      name: cls.name,
      providers: (Reflect.getMetadata(MODULE_METADATA.PROVIDERS, cls) ??
        []) as unknown[],
      imports: (Reflect.getMetadata(MODULE_METADATA.IMPORTS, cls) ??
        []) as AnyModule[],
    };
  }
  const dyn = raw as DynamicModule;
  if (typeof dyn.module !== 'function') return null;
  return {
    key: dyn,
    name: `${dyn.module.name} (dynamic)`,
    providers: [
      ...((Reflect.getMetadata(MODULE_METADATA.PROVIDERS, dyn.module) ??
        []) as unknown[]),
      ...(dyn.providers ?? []),
    ],
    imports: [
      ...((Reflect.getMetadata(MODULE_METADATA.IMPORTS, dyn.module) ??
        []) as AnyModule[]),
      ...((dyn.imports ?? []) as AnyModule[]),
    ],
  };
}

/** Every module reachable from [root], each once. */
function graph(root: AnyModule): Node[] {
  const seen = new Set<unknown>();
  const out: Node[] = [];
  const stack: AnyModule[] = [root];
  while (stack.length > 0) {
    const n = nodeOf(stack.pop()!);
    if (!n || seen.has(n.key)) continue;
    seen.add(n.key);
    out.push(n);
    stack.push(...n.imports);
  }
  return out;
}

/**
 * Pack C (round 2 #22, 25.11): JobsModule listed ~20 services that their
 * own modules already provide, so the API process ran a second instance of
 * each (a second OpenSearch client and S3 client with their own
 * connections, the indexer's pause state split in two, the starter synonyms
 * imported twice, DAU touches on a copy without the consent check).
 */
describe('JobsModule provides no second copy of a stateful service', () => {
  const jobs = JobsModule.register({ mode: 'api' });
  const own = new Set((jobs.providers ?? []).map(tokenOf));
  const imported = new Set(jobs.imports ?? []);

  it.each([
    ['AnalyticsService', AnalyticsService, AnalyticsCoreModule],
    ['SearchSynonymsService', SearchSynonymsService, SearchCoreModule],
    ['SearchIndexerService', SearchIndexerService, SearchCoreModule],
    ['the OpenSearch client', OpenSearchClient, SearchCoreModule],
    ['S3StorageService', S3StorageService, StorageCoreModule],
  ])('%s comes from its owner module, exported once', (_n, token, owner) => {
    expect(own.has(token)).toBe(false);
    expect(imported.has(owner)).toBe(true);
    const exported = (Reflect.getMetadata(MODULE_METADATA.EXPORTS, owner) ??
      []) as unknown[];
    expect(exported).toContain(token);
  });

  /**
   * Holes re-check (25.11, item 17): the generic rule, not a list. Nest
   * builds one instance per (module, provider); a class listed by JobsModule
   * AND by any other module the API or the worker loads is a second
   * instance. Every provider of JobsModule must be provided nowhere else in
   * the process — the owner module provides it and JobsModule imports it.
   * Red on the old JobsModule: CrashReportsService, PublicDirectoryService,
   * PartitionService, DashboardService, AdminOverviewService,
   * HotlineStatsService, BillingOverviewService, PnlService and
   * MessageReencryptJob were provided here and in their own modules.
   */
  it.each([
    ['the API process (AppModule)', () => AppModule as AnyModule],
    ['the worker process (WorkerModule)', () => WorkerModule as AnyModule],
  ])('%s: no JobsModule provider is provided by another module', (_n, root) => {
    const nodes = graph(root());
    const jobsNodes = nodes.filter(
      (n) => (n.key as DynamicModule).module === JobsModule,
    );
    expect(jobsNodes).toHaveLength(1);
    const mine = new Set<unknown>(
      jobsNodes[0].providers
        .map(tokenOf)
        .filter((t) => typeof t === 'function'),
    );
    expect(mine.size).toBeGreaterThan(20);
    const dupes: string[] = [];
    for (const n of nodes) {
      if (n === jobsNodes[0]) continue;
      for (const t of n.providers.map(tokenOf)) {
        if (mine.has(t)) dupes.push(`${nameOf(t)} also in ${n.name}`);
      }
    }
    expect(dupes.sort()).toEqual([]);
  });
});

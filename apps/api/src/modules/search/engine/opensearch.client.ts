import { ConfigService } from '@nestjs/config';
import { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import { SecretsService } from '../../../common/secrets/secrets.service';
import {
  awsCredentialsProvider,
  parseEngineKind,
  type CredentialsProvider,
  type EngineKind,
} from './engine-auth';
import { signRequest } from './sigv4';
import {
  SEARCH_ENTITIES,
  generationOf,
  physicalIndex,
  readAlias,
  templateBody,
  templateName,
  writeAlias,
  type SearchEntity,
} from './search-engine.mappings';

export interface IndexInfo {
  name: string;
  generation: number;
  docs: number;
  sizeBytes: number;
}

/** Where one entity's generations and aliases are right now. */
export interface EntityLayout {
  entity: SearchEntity;
  indexes: IndexInfo[];
  readTarget: string | null;
  writeTarget: string | null;
}

export interface EngineCreds {
  /** https://vpc-xxx.us-east-1.es.amazonaws.com (no trailing slash). */
  url: string;
  username?: string;
  password?: string;
  /** Index name prefix, default `lawbid`. */
  prefix: string;
  /** Copies of each index (OPENSEARCH_REPLICAS, set by Terraform: 1 once the
   * domain has two or more nodes). */
  replicas: number;
  /** domain (default) or serverless (SigV4-signed, service `aoss`). */
  kind: EngineKind;
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export interface BulkOp {
  entity: SearchEntity;
  id: string;
  /** null = delete the document. */
  doc: Record<string, unknown> | null;
  /** External version = when the document was loaded (ms). An older write
   * can then never overwrite a newer one (409 = fine). */
  version?: number;
}

export interface BulkResult {
  /** Ops that failed, with the engine's reason (404 on delete is fine). */
  failed: { entity: SearchEntity; id: string; reason: string }[];
}

/**
 * A small OpenSearch / Elasticsearch-compatible REST client on plain fetch:
 * no SDK, so the API image does not grow and nothing loads while the
 * switch is off. Keys: Admin → Integrations → `opensearch`
 * (url, username, password, prefix), else OPENSEARCH_URL / _USERNAME /
 * _PASSWORD / _PREFIX.
 */
export class OpenSearchClient {
  constructor(
    private readonly secrets: Pick<SecretsService, 'get'> | undefined,
    private readonly config: Pick<ConfigService, 'get'> | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    /** Admin `search.engine_kind` (default domain). */
    private readonly kindOf: () => Promise<EngineKind> = () =>
      Promise.resolve('domain'),
    private readonly awsCreds: CredentialsProvider = awsCredentialsProvider(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async creds(): Promise<EngineCreds | null> {
    const f = (await this.secrets?.get('opensearch'))?.fields ?? {};
    const kind = await this.kindOf();
    // Serverless has its own address (OPENSEARCH_SERVERLESS_URL, set by
    // Terraform); the Integrations card `url` stays the domain's.
    const rawUrl =
      kind === 'serverless'
        ? (f.serverless_url ??
          this.config?.get<string>('OPENSEARCH_SERVERLESS_URL') ??
          '')
        : (f.url ?? this.config?.get<string>('OPENSEARCH_URL') ?? '');
    const url = rawUrl.trim().replace(/\/+$/, '');
    if (!url) return null;
    const username = (
      f.username ??
      this.config?.get<string>('OPENSEARCH_USERNAME') ??
      ''
    ).trim();
    const password = (
      f.password ??
      this.config?.get<string>('OPENSEARCH_PASSWORD') ??
      ''
    ).trim();
    const prefix = (
      f.prefix ??
      this.config?.get<string>('OPENSEARCH_PREFIX') ??
      'lawbid'
    ).trim();
    const replicas = Number(this.config?.get<string>('OPENSEARCH_REPLICAS'));
    return {
      url,
      username: username || undefined,
      password: password || undefined,
      prefix: prefix || 'lawbid',
      // Serverless manages copies itself (number_of_replicas is rejected).
      replicas:
        kind === 'domain' && Number.isInteger(replicas) && replicas >= 0
          ? replicas
          : 0,
      kind,
    };
  }

  async isConfigured(): Promise<boolean> {
    return (await this.creds()) !== null;
  }

  async prefix(): Promise<string> {
    return (await this.creds())?.prefix ?? 'lawbid';
  }

  private async call(
    method: string,
    path: string,
    body?: string,
    timeoutMs = 5000,
    contentType = 'application/json',
  ): Promise<{ status: number; json: unknown }> {
    const c = await this.creds();
    if (!c) throw new EngineError('search engine is not configured');
    const headers: Record<string, string> = { 'content-type': contentType };
    if (c.username && c.password) {
      headers.authorization = `Basic ${Buffer.from(
        `${c.username}:${c.password}`,
      ).toString('base64')}`;
    }
    if (c.kind === 'serverless') {
      const creds = await this.awsCreds();
      if (!creds) throw new EngineError('no AWS credentials for Serverless');
      Object.assign(
        headers,
        signRequest({
          method,
          url: `${c.url}${path}`,
          body,
          region: this.config?.get<string>('AWS_REGION') ?? 'us-east-1',
          service: 'aoss',
          credentials: creds,
          date: this.now(),
          contentSha256Header: true,
        }),
      );
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${c.url}${path}`, {
        method,
        headers,
        body,
        signal: ctl.signal,
      });
      let json: unknown = null;
      const raw = await res.text();
      if (raw) {
        try {
          json = JSON.parse(raw);
        } catch {
          json = raw;
        }
      }
      return { status: res.status, json };
    } catch (e) {
      throw new EngineError(
        e instanceof Error && e.name === 'AbortError'
          ? `search engine timeout after ${timeoutMs} ms`
          : `search engine unreachable: ${e instanceof Error ? e.message : 'error'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Cluster answers (used by the integration's "Check"). */
  async ping(): Promise<boolean> {
    // Serverless has no `GET /`; listing indexes is allowed on both.
    const serverless = (await this.creds())?.kind === 'serverless';
    const r = await this.call(
      'GET',
      serverless ? `/_cat/indices/${await this.prefix()}-*?format=json` : '/',
      undefined,
      3000,
    );
    return r.status >= 200 && r.status < 300;
  }

  /** Ids of the best matches of [query] in [entity], best first. */
  async searchIds(
    entity: SearchEntity,
    query: Record<string, unknown>,
    size: number,
    timeoutMs: number,
    sort?: Record<string, 'asc' | 'desc'>[],
    /** Return this stored field of each hit instead of its id. */
    field?: string,
  ): Promise<string[]> {
    const index = readAlias(await this.prefix(), entity);
    const r = await this.call(
      'POST',
      `/${index}/_search`,
      JSON.stringify({
        size,
        _source: field ? [field] : false,
        track_total_hits: false,
        ...(sort ? { sort } : {}),
        query,
      }),
      timeoutMs,
    );
    // 404 = the index/alias is missing: that is an engine failure (so the
    // Postgres fallback answers), never "no results".
    if (r.status >= 300) {
      throw new EngineError(
        r.status === 404
          ? 'search index or alias is missing (404)'
          : `search failed (${r.status})`,
        r.status,
      );
    }
    const hits =
      (
        r.json as {
          hits?: {
            hits?: { _id: string; _source?: Record<string, unknown> }[];
          };
        } | null
      )?.hits?.hits ?? [];
    return field
      ? hits
          .map((h) => (h._source?.[field] as string | undefined) ?? '')
          .filter(Boolean)
      : hits.map((h) => h._id);
  }

  // --- layout: indexes, aliases, templates ----------------------------------

  /** Every generation of every entity plus where the two aliases point. */
  async layout(): Promise<EntityLayout[]> {
    const prefix = await this.prefix();
    const idx = await this.call(
      'GET',
      `/_cat/indices/${prefix}-*?format=json&h=index,docs.count,store.size&bytes=b`,
    );
    const als = await this.call(
      'GET',
      `/_cat/aliases/${prefix}-*?format=json&h=alias,index`,
    );
    for (const r of [idx, als]) {
      if (r.status >= 300 && r.status !== 404) {
        throw new EngineError(`layout failed (${r.status})`, r.status);
      }
    }
    const indexRows = Array.isArray(idx.json)
      ? (idx.json as Record<string, string>[])
      : [];
    const aliasRows = Array.isArray(als.json)
      ? (als.json as Record<string, string>[])
      : [];
    return SEARCH_ENTITIES.map((entity) => {
      const indexes: IndexInfo[] = [];
      for (const r of indexRows) {
        const generation = generationOf(prefix, entity, r.index);
        if (generation === null) continue;
        indexes.push({
          name: r.index,
          generation,
          docs: Number(r['docs.count'] ?? 0) || 0,
          sizeBytes: Number(r['store.size'] ?? 0) || 0,
        });
      }
      indexes.sort((a, b) => a.generation - b.generation);
      const target = (alias: string): string | null =>
        aliasRows.find((a) => a.alias === alias)?.index ?? null;
      return {
        entity,
        indexes,
        readTarget: target(readAlias(prefix, entity)),
        writeTarget: target(writeAlias(prefix, entity)),
      };
    });
  }

  /** Creates/updates the index template (idempotent PUT). */
  async putTemplate(entity: SearchEntity): Promise<void> {
    const prefix = await this.prefix();
    const r = await this.call(
      'PUT',
      `/_index_template/${templateName(prefix, entity)}`,
      JSON.stringify(templateBody(prefix, entity)),
      30_000,
    );
    if (r.status >= 300) {
      throw new EngineError(
        `put template failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`,
        r.status,
      );
    }
  }

  /**
   * Makes sure every entity has an index generation and both aliases:
   *  - nothing yet → templates, then `-v1` is created with the aliases;
   *  - a pre-alias `-v<N>` index → the aliases are added to it (no data
   *    moves, searches never notice).
   * Returns the entities that were created or adopted.
   */
  async bootstrap(replicas?: number): Promise<SearchEntity[]> {
    const prefix = await this.prefix();
    const rep = replicas ?? (await this.creds())?.replicas ?? 0;
    const done: SearchEntity[] = [];
    const layout = await this.layout();
    for (const l of layout) {
      if (l.readTarget && l.writeTarget) continue;
      await this.putTemplate(l.entity);
      const read = readAlias(prefix, l.entity);
      const write = writeAlias(prefix, l.entity);
      if (l.indexes.length === 0) {
        const name = physicalIndex(prefix, l.entity, 1);
        const r = await this.call(
          'PUT',
          `/${name}`,
          JSON.stringify({
            settings: { number_of_replicas: rep },
            aliases: { [read]: {}, [write]: { is_write_index: true } },
          }),
          30_000,
        );
        if (r.status >= 300) {
          throw new EngineError(
            `create index failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`,
            r.status,
          );
        }
      } else {
        const live = l.indexes[l.indexes.length - 1].name;
        const actions: unknown[] = [];
        if (!l.readTarget) actions.push({ add: { index: live, alias: read } });
        if (!l.writeTarget) {
          actions.push({
            add: { index: live, alias: write, is_write_index: true },
          });
        }
        await this.aliases(actions);
      }
      done.push(l.entity);
    }
    return done;
  }

  /** Creates generation [generation] of [entity] (settings/mappings come
   * from the index template). */
  async createGeneration(
    entity: SearchEntity,
    generation: number,
    replicas?: number,
  ): Promise<string> {
    const prefix = await this.prefix();
    await this.putTemplate(entity);
    const name = physicalIndex(prefix, entity, generation);
    const r = await this.call(
      'PUT',
      `/${name}`,
      JSON.stringify({
        settings: {
          number_of_replicas: replicas ?? (await this.creds())?.replicas ?? 0,
        },
      }),
      30_000,
    );
    if (r.status >= 300) {
      throw new EngineError(
        `create index failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`,
        r.status,
      );
    }
    return name;
  }

  /** One atomic `_aliases` request (all actions apply together or none). */
  async aliases(actions: unknown[]): Promise<void> {
    if (actions.length === 0) return;
    const r = await this.call(
      'POST',
      '/_aliases',
      JSON.stringify({ actions }),
      30_000,
    );
    if (r.status >= 300) {
      throw new EngineError(
        `alias update failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`,
        r.status,
      );
    }
  }

  /**
   * Points aliases at other generations in ONE atomic request. Each change
   * removes the alias from [from] (when set) and adds it to [to].
   */
  async swap(
    changes: {
      entity: SearchEntity;
      which: 'read' | 'write';
      from: string | null;
      to: string;
    }[],
  ): Promise<void> {
    const prefix = await this.prefix();
    const actions: unknown[] = [];
    for (const c of changes) {
      const alias =
        c.which === 'read'
          ? readAlias(prefix, c.entity)
          : writeAlias(prefix, c.entity);
      if (c.from) actions.push({ remove: { index: c.from, alias } });
      actions.push({
        add: {
          index: c.to,
          alias,
          ...(c.which === 'write' ? { is_write_index: true } : {}),
        },
      });
    }
    await this.aliases(actions);
  }

  /** Deletes a physical index; refuses one that still carries an alias. */
  async deleteIndex(name: string): Promise<void> {
    const prefix = await this.prefix();
    if (!name.startsWith(`${prefix}-`) || name.includes('*')) {
      throw new EngineError(`refusing to delete ${name}`);
    }
    for (const l of await this.layout()) {
      if (l.readTarget === name || l.writeTarget === name) {
        throw new EngineError(`${name} still has an alias`);
      }
    }
    const r = await this.call('DELETE', `/${name}`, undefined, 30_000);
    if (r.status >= 300 && r.status !== 404) {
      throw new EngineError(`drop index failed (${r.status})`, r.status);
    }
  }

  /** Test/CLI helper: drops every generation of [entity] (aliases go too). */
  async dropIndex(entity: SearchEntity): Promise<void> {
    const prefix = await this.prefix();
    const r = await this.call(
      'DELETE',
      `/${prefix}-${entity}-v*`,
      undefined,
      30_000,
    );
    if (r.status >= 300 && r.status !== 404) {
      throw new EngineError(`drop index failed (${r.status})`, r.status);
    }
  }

  /** Exact document count of one physical index (or alias). */
  async countIndex(name: string): Promise<number> {
    // Serverless refreshes by itself and rejects _refresh.
    if ((await this.creds())?.kind !== 'serverless') {
      await this.call('POST', `/${name}/_refresh`, undefined, 30_000);
    }
    const r = await this.call('GET', `/${name}/_count`);
    if (r.status === 404) return 0;
    return (r.json as { count?: number } | null)?.count ?? 0;
  }

  /** `_meta.mapping_version` of an index (null: created before templates). */
  async mappingVersion(index: string): Promise<number | null> {
    const r = await this.call(
      'GET',
      `/${index}/_mapping?filter_path=*.mappings._meta`,
    );
    if (r.status >= 300) return null;
    const first = Object.values(
      (r.json ?? {}) as Record<
        string,
        { mappings?: { _meta?: { mapping_version?: number } } }
      >,
    )[0];
    return first?.mappings?._meta?.mapping_version ?? null;
  }

  /** Documents of the read alias (what searches see). */
  async count(entity: SearchEntity): Promise<number> {
    return this.countIndex(readAlias(await this.prefix(), entity));
  }

  /** Up to [n] random documents of one index (id + source). */
  async sample(
    index: string,
    n: number,
  ): Promise<{ id: string; doc: Record<string, unknown> }[]> {
    const r = await this.call(
      'POST',
      `/${index}/_search`,
      JSON.stringify({
        size: n,
        query: {
          function_score: { query: { match_all: {} }, random_score: {} },
        },
      }),
      15_000,
    );
    if (r.status === 404) return [];
    if (r.status >= 300) {
      throw new EngineError(`sample failed (${r.status})`, r.status);
    }
    const hits =
      (
        r.json as {
          hits?: {
            hits?: { _id: string; _source?: Record<string, unknown> }[];
          };
        } | null
      )?.hits?.hits ?? [];
    return hits.map((h) => ({ id: h._id, doc: h._source ?? {} }));
  }

  /** id → source (missing ids are absent) from one index. */
  async getDocs(
    index: string,
    ids: string[],
  ): Promise<Map<string, Record<string, unknown>>> {
    const out = new Map<string, Record<string, unknown>>();
    if (ids.length === 0) return out;
    const r = await this.call(
      'POST',
      `/${index}/_mget`,
      JSON.stringify({ ids }),
      15_000,
    );
    if (r.status >= 300) {
      throw new EngineError(`mget failed (${r.status})`, r.status);
    }
    const docs =
      (
        r.json as {
          docs?: {
            _id: string;
            found?: boolean;
            _source?: Record<string, unknown>;
          }[];
        } | null
      )?.docs ?? [];
    for (const d of docs) if (d.found && d._source) out.set(d._id, d._source);
    return out;
  }

  // --- native _reindex (engine → engine copy, used when documents keep
  // their shape and only the index settings/mappings change) ----------------

  /** Starts an engine-side copy and returns its task id. */
  async startReindexTask(
    source: string,
    dest: string,
    requestsPerSecond: number,
  ): Promise<string> {
    const r = await this.call(
      'POST',
      `/_reindex?wait_for_completion=false&slices=auto&requests_per_second=${requestsPerSecond > 0 ? requestsPerSecond : -1}`,
      JSON.stringify({
        source: { index: source },
        dest: { index: dest, version_type: 'external_gte' },
        conflicts: 'proceed',
      }),
      30_000,
    );
    const task = (r.json as { task?: string } | null)?.task;
    if (r.status >= 300 || !task) {
      throw new EngineError(`reindex start failed (${r.status})`, r.status);
    }
    return task;
  }

  async reindexTask(task: string): Promise<{
    completed: boolean;
    total: number;
    done: number;
    error?: string;
  }> {
    const r = await this.call('GET', `/_tasks/${encodeURIComponent(task)}`);
    if (r.status === 404) {
      return { completed: true, total: 0, done: 0, error: 'task not found' };
    }
    if (r.status >= 300) {
      throw new EngineError(`task status failed (${r.status})`, r.status);
    }
    const j = r.json as {
      completed?: boolean;
      task?: {
        status?: {
          total?: number;
          created?: number;
          updated?: number;
          version_conflicts?: number;
        };
      };
      error?: { reason?: string };
      response?: { failures?: unknown[] };
    };
    const s = j.task?.status ?? {};
    return {
      completed: j.completed === true,
      total: s.total ?? 0,
      done: (s.created ?? 0) + (s.updated ?? 0) + (s.version_conflicts ?? 0),
      error:
        j.error?.reason ??
        (j.response?.failures?.length ? 'reindex had failures' : undefined),
    };
  }

  async cancelReindexTask(task: string): Promise<void> {
    await this.call('POST', `/_tasks/${encodeURIComponent(task)}/_cancel`);
  }

  // --- writes ---------------------------------------------------------------

  /**
   * One _bulk call. Index ops go to the WRITE alias plus, as dual-writes,
   * the generation the read alias points at (when different) and [extra]
   * (a generation being built or kept warm for rollback). Delete ops go to
   * EVERY generation of the entity (GDPR: old and new during a reindex).
   * Documents carry an external version (the load time), so a slower older
   * write can never overwrite a newer one; conflicts count as success.
   */
  async bulk(
    ops: BulkOp[],
    extra: Partial<Record<SearchEntity, string[]>> = {},
  ): Promise<BulkResult> {
    if (ops.length === 0) return { failed: [] };
    const prefix = await this.prefix();
    const layout = new Map((await this.layout()).map((l) => [l.entity, l]));
    const lines: string[] = [];
    const owner: number[] = []; // line pair → op index
    ops.forEach((op, i) => {
      const l = layout.get(op.entity);
      const targets = new Set<string>();
      if (op.doc) {
        targets.add(writeAlias(prefix, op.entity));
        const skip = l?.writeTarget ?? null;
        for (const t of [l?.readTarget ?? null, ...(extra[op.entity] ?? [])]) {
          if (t && t !== skip) targets.add(t);
        }
      } else {
        for (const x of l?.indexes ?? []) targets.add(x.name);
        for (const t of extra[op.entity] ?? []) targets.add(t);
        if (targets.size === 0) targets.add(writeAlias(prefix, op.entity));
      }
      for (const _index of targets) {
        lines.push(...this.bulkLines(_index, op));
        owner.push(i);
      }
    });
    return this.sendBulk(ops, lines, owner);
  }

  /** Writes [ops] into exactly one physical index (backfill). */
  async bulkInto(index: string, ops: BulkOp[]): Promise<BulkResult> {
    if (ops.length === 0) return { failed: [] };
    const lines: string[] = [];
    const owner: number[] = [];
    ops.forEach((op, i) => {
      lines.push(...this.bulkLines(index, op));
      owner.push(i);
    });
    return this.sendBulk(ops, lines, owner);
  }

  private bulkLines(_index: string, op: BulkOp): string[] {
    const ver =
      op.version !== undefined
        ? { version: op.version, version_type: 'external_gte' }
        : {};
    return op.doc
      ? [
          JSON.stringify({ index: { _index, _id: op.id, ...ver } }),
          JSON.stringify(op.doc),
        ]
      : [JSON.stringify({ delete: { _index, _id: op.id, ...ver } })];
  }

  private async sendBulk(
    ops: BulkOp[],
    lines: string[],
    owner: number[],
  ): Promise<BulkResult> {
    const r = await this.call(
      'POST',
      '/_bulk',
      `${lines.join('\n')}\n`,
      30_000,
      'application/x-ndjson',
    );
    if (r.status >= 300) {
      throw new EngineError(`bulk failed (${r.status})`, r.status);
    }
    const items =
      (
        r.json as {
          items?: Record<
            string,
            { status: number; error?: { reason?: string; type?: string } }
          >[];
        } | null
      )?.items ?? [];
    const failed = new Map<number, string>();
    items.forEach((item, k) => {
      const res = Object.values(item)[0];
      const i = owner[k];
      if (!res || i === undefined) return;
      const isDelete = ops[i].doc === null;
      // 409: a newer version is already there; 404 on delete: already gone.
      if (
        res.status >= 300 &&
        res.status !== 409 &&
        !(isDelete && res.status === 404)
      ) {
        failed.set(
          i,
          res.error?.reason ?? res.error?.type ?? `status ${res.status}`,
        );
      }
    });
    return {
      failed: [...failed].map(([i, reason]) => ({
        entity: ops[i].entity,
        id: ops[i].id,
        reason,
      })),
    };
  }
}

/** Builds the client; `search.engine_kind` is read per call, so the admin
 * can flip domain <-> serverless without a deploy. */
export function createOpenSearchClient(
  secrets: Pick<SecretsService, 'get'> | undefined,
  config: Pick<ConfigService, 'get'> | undefined,
  settings?: Pick<AppSettingsService, 'string'>,
): OpenSearchClient {
  return new OpenSearchClient(secrets, config, fetch, async () =>
    parseEngineKind(await settings?.string('search.engine_kind')),
  );
}

/** Nest provider for the client (a plain class: built from the globals). */
export const OPENSEARCH_CLIENT_PROVIDER = {
  provide: OpenSearchClient,
  useFactory: (
    secrets: SecretsService,
    config: ConfigService,
    settings?: AppSettingsService,
  ) => createOpenSearchClient(secrets, config, settings),
  inject: [
    SecretsService,
    ConfigService,
    { token: AppSettingsService, optional: true },
  ],
};

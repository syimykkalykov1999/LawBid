import { ConfigService } from '@nestjs/config';
import { SecretsService } from '../../../common/secrets/secrets.service';
import {
  MAPPINGS,
  indexName,
  type SearchEntity,
} from './search-engine.mappings';

export interface EngineCreds {
  /** https://vpc-xxx.us-east-1.es.amazonaws.com (no trailing slash). */
  url: string;
  username?: string;
  password?: string;
  /** Index name prefix, default `lawbid`. */
  prefix: string;
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
  ) {}

  async creds(): Promise<EngineCreds | null> {
    const f = (await this.secrets?.get('opensearch'))?.fields ?? {};
    const url = (f.url ?? this.config?.get<string>('OPENSEARCH_URL') ?? '')
      .trim()
      .replace(/\/+$/, '');
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
    return {
      url,
      username: username || undefined,
      password: password || undefined,
      prefix: prefix || 'lawbid',
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
    const r = await this.call('GET', '/', undefined, 3000);
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
    const index = indexName(await this.prefix(), entity);
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
    if (r.status === 404) return [];
    if (r.status >= 300) {
      throw new EngineError(`search failed (${r.status})`, r.status);
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

  /** Creates the index with its mapping when it does not exist yet. */
  async ensureIndex(entity: SearchEntity, replicas = 0): Promise<boolean> {
    const index = indexName(await this.prefix(), entity);
    const head = await this.call('HEAD', `/${index}`);
    if (head.status === 200) return false;
    const def = structuredClone(MAPPINGS[entity]) as {
      settings: Record<string, unknown>;
    };
    def.settings.number_of_replicas = replicas;
    const r = await this.call('PUT', `/${index}`, JSON.stringify(def), 30_000);
    if (r.status >= 300) {
      throw new EngineError(
        `create index failed (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`,
        r.status,
      );
    }
    return true;
  }

  async dropIndex(entity: SearchEntity): Promise<void> {
    const index = indexName(await this.prefix(), entity);
    const r = await this.call('DELETE', `/${index}`, undefined, 30_000);
    if (r.status >= 300 && r.status !== 404) {
      throw new EngineError(`drop index failed (${r.status})`, r.status);
    }
  }

  async count(entity: SearchEntity): Promise<number> {
    const index = indexName(await this.prefix(), entity);
    const r = await this.call('GET', `/${index}/_count`);
    if (r.status === 404) return 0;
    return (r.json as { count?: number } | null)?.count ?? 0;
  }

  /** One _bulk call: index or delete each op (idempotent by document id). */
  async bulk(ops: BulkOp[]): Promise<BulkResult> {
    if (ops.length === 0) return { failed: [] };
    const prefix = await this.prefix();
    const lines: string[] = [];
    for (const op of ops) {
      const _index = indexName(prefix, op.entity);
      if (op.doc) {
        lines.push(JSON.stringify({ index: { _index, _id: op.id } }));
        lines.push(JSON.stringify(op.doc));
      } else {
        lines.push(JSON.stringify({ delete: { _index, _id: op.id } }));
      }
    }
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
    const failed: BulkResult['failed'] = [];
    items.forEach((item, i) => {
      const res = Object.values(item)[0];
      if (!res) return;
      const isDelete = ops[i].doc === null;
      if (res.status >= 300 && !(isDelete && res.status === 404)) {
        failed.push({
          entity: ops[i].entity,
          id: ops[i].id,
          reason:
            res.error?.reason ?? res.error?.type ?? `status ${res.status}`,
        });
      }
    });
    return { failed };
  }
}

/** Nest provider for the client (a plain class: built from the globals). */
export const OPENSEARCH_CLIENT_PROVIDER = {
  provide: OpenSearchClient,
  useFactory: (secrets: SecretsService, config: ConfigService) =>
    new OpenSearchClient(secrets, config),
  inject: [SecretsService, ConfigService],
};

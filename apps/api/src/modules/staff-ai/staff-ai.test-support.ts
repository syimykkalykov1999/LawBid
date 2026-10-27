/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-base-to-string, @typescript-eslint/no-redundant-type-constituents */
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SecretsService } from '../../common/secrets/secrets.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffAiBudgetService } from './staff-ai-budget.service';
import { StaffAiClient, type StaffAiFetch } from './staff-ai-client.service';

/** The Redis commands staff AI mode uses, in memory. */
export class MemRedis {
  readonly kv = new Map<string, string>();
  readonly hashes = new Map<string, Map<string, number>>();
  get = (k: string) => Promise.resolve(this.kv.get(k) ?? null);
  exists = (k: string) => Promise.resolve(this.kv.has(k) ? 1 : 0);
  set = (k: string, v: string, ...args: unknown[]) => {
    if (args.includes('NX') && this.kv.has(k)) return Promise.resolve(null);
    this.kv.set(k, v);
    return Promise.resolve('OK');
  };
  incr = (k: string) => this.incrby(k, 1);
  incrby = (k: string, n: number) => {
    const v = Number(this.kv.get(k) ?? 0) + n;
    this.kv.set(k, String(v));
    return Promise.resolve(v);
  };
  decrby = (k: string, n: number) => this.incrby(k, -n);
  hincrby = (k: string, f: string, n: number) => {
    const h = this.hashes.get(k) ?? new Map<string, number>();
    h.set(f, (h.get(f) ?? 0) + n);
    this.hashes.set(k, h);
    return Promise.resolve(h.get(f) as number);
  };
  hgetall = (k: string) =>
    Promise.resolve(
      Object.fromEntries(
        [...(this.hashes.get(k) ?? new Map<string, number>())].map(([f, v]) => [
          f,
          String(v),
        ]),
      ),
    );
  expire = () => Promise.resolve(1);
}

/** Real StaffSettingsService over a stored-config object. */
export const settingsOf = (stored: Record<string, unknown> = {}) =>
  new StaffSettingsService({
    all: () => Promise.resolve(stored),
  } as unknown as AppSettingsService);

/** Switches: master + the three features on. */
export const AI_ON = {
  'staff.ai_enabled': true,
  'staff.ai_qa_enabled': true,
  'staff.ai_hint_enabled': true,
  'staff.ai_summary_enabled': true,
};

/** A prisma stand-in with an in-memory app_config table. */
export function memAppConfig() {
  const rows = new Map<string, unknown>();
  return {
    rows,
    appConfig: {
      findUnique: ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          rows.has(where.key)
            ? { key: where.key, value: rows.get(where.key) }
            : null,
        ),
      upsert: ({
        where,
        create,
      }: {
        where: { key: string };
        create: { value: unknown };
      }) => {
        rows.set(where.key, create.value);
        return Promise.resolve({});
      },
    },
  };
}

export interface ClientKit {
  client: StaffAiClient;
  budget: StaffAiBudgetService;
  redis: MemRedis;
  /** Every request the client made (url, parsed body). */
  calls: Array<{
    url: string;
    method: string;
    headers: Record<string, string>;
    body: any;
  }>;
  secrets: { field: jest.Mock };
  db: ReturnType<typeof memAppConfig>;
}

/** A StaffAiClient over mocks; `respond` answers each call. */
export function clientKit(
  stored: Record<string, unknown>,
  respond: (url: string, body: any) => unknown | Promise<unknown>,
  key: string | null = 'sk-ant-test-0000000000000000',
): ClientKit {
  const redis = new MemRedis();
  const db = memAppConfig();
  const settings = settingsOf(stored);
  const budget = new StaffAiBudgetService(
    db as unknown as PrismaService,
    redis as never,
    settings,
  );
  const calls: ClientKit['calls'] = [];
  const http: StaffAiFetch = async (url, init) => {
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({
      url,
      method: String(init.method),
      headers: init.headers as Record<string, string>,
      body,
    });
    const out = await respond(url, body);
    if (out instanceof Response) return out;
    if (typeof out === 'string') return new Response(out, { status: 200 });
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const secrets = { field: jest.fn(() => Promise.resolve(key ?? undefined)) };
  const client = new StaffAiClient(
    settings,
    secrets as unknown as SecretsService,
    budget,
    http,
  );
  return { client, budget, redis, calls, secrets, db };
}

/** A Messages API answer carrying `value` as the JSON text. */
export const messageOf = (
  value: unknown,
  usage = { input_tokens: 1200, output_tokens: 80 },
  stop = 'end_turn',
) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  content: [{ type: 'text', text: JSON.stringify(value) }],
  stop_reason: stop,
  usage,
});

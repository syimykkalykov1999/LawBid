/**
 * Data-layer audit 2026-11-04 (R-395): a stand-in PrismaClient for unit
 * tests that counts every model query (the same number Prisma's `query`
 * log event would print once per statement here, since each delegate call
 * is one statement). `results[model.method]` answers a call, default `[]`
 * for findMany / groupBy, `null` for findFirst / findUnique, `0` for count.
 */
export interface QueryLogEntry {
  model: string;
  method: string;
  args: unknown;
}

export function countingPrisma(results: Record<string, unknown> = {}): {
  prisma: unknown;
  log: QueryLogEntry[];
  count: (m?: string) => number;
} {
  const log: QueryLogEntry[] = [];
  const fallback = (method: string): unknown =>
    method === 'findMany' || method === 'groupBy'
      ? []
      : method === 'count'
        ? 0
        : null;
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => {
          log.push({ model: name, method, args });
          const key = `${name}.${method}`;
          const r = results[key];
          return Promise.resolve(
            typeof r === 'function'
              ? (r as (a: unknown) => unknown)(args)
              : key in results
                ? r
                : fallback(method),
          );
        },
      },
    );
  const models = new Map<string, unknown>();
  const prisma = new Proxy(
    {},
    {
      get: (_t, name: string) => {
        if (name === 'then') return undefined;
        if (!models.has(name)) models.set(name, model(name));
        return models.get(name);
      },
    },
  );
  return {
    prisma,
    log,
    count: (m?: string) =>
      m ? log.filter((e) => `${e.model}.${e.method}` === m).length : log.length,
  };
}

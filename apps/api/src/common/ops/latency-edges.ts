/** Upper edges (ms) of the latency buckets; the last bucket is "slower". */
export const LATENCY_EDGES_MS = [
  25, 50, 100, 250, 500, 1000, 2500, 5000,
] as const;

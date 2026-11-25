import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import {
  AlwaysOnSampler,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  type Sampler,
} from '@opentelemetry/sdk-trace';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_URL_PATH,
  ATTR_URL_QUERY,
} from '@opentelemetry/semantic-conventions';
import { safeUrl } from '../common/logging/http-log-policy';

/**
 * docs/06 §8 "Трассировка: OpenTelemetry (API → БД → очереди)". Started
 * before Nest loads (see main.ts / worker.ts) so the auto-instrumentation
 * patches http, express, ioredis, pg/prisma and socket.io. Off unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set (dev/e2e stay untouched); the
 * collector address is the OpenTelemetry Collector sidecar/service of
 * infra (§6.1; modules/ecs `tracing_enabled`, off by default, adds the
 * ADOT sidecar and these env vars; spans go to AWS X-Ray). Sampling: with
 * tail sampling (default) the app records everything and the collector
 * keeps errors, slow traces and 5 % of the rest; otherwise
 * ParentBased(TraceIdRatio 5 %). No request bodies or headers are recorded — the
 * instrumentations are left at their defaults and pino redaction covers
 * the logs; spans carry route, status and duration only.
 */
/** Share of traces kept when no caller decided (S12-2): OTEL_TRACES_SAMPLER_ARG,
 * default 5 %, clamped to 0..1. A phone's `traceparent` (sampled flag) wins. */
export function traceSampleRatio(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.OTEL_TRACES_SAMPLER_ARG ?? '0.05');
  return Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.05;
}

/** ParentBased(TraceIdRatio): follows the caller's sampled flag, otherwise
 * keeps [ratio] of the traces — the cost ceiling of the tracing bill. */
export function buildSampler(ratio: number): Sampler {
  return new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(ratio),
  });
}

/**
 * Item 14 (25.11): the sampler named by the standard OTEL_TRACES_SAMPLER
 * env var. `always_on` = tail sampling in the ADOT collector (modules/ecs
 * `tracing_tail_sampling`): the app records every request, also those a
 * phone marked "not sampled", and the collector keeps every error and slow
 * trace plus the configured share of the rest. Anything else = the head
 * sampling above.
 */
export function samplerFromEnv(env: NodeJS.ProcessEnv = process.env): Sampler {
  if (env.OTEL_TRACES_SAMPLER === 'always_on') return new AlwaysOnSampler();
  return buildSampler(traceSampleRatio(env));
}

/**
 * Detective R2B-6 (14.11): a server span gets the same safe URL as the log
 * line — token paths redacted, query values dropped (search text, the
 * ring `?t=` ticket). `startIncomingSpanHook` of
 * @opentelemetry/instrumentation-http (Apache-2.0): its attributes are
 * merged over the defaults (`url.path`, `url.query`) when the span starts.
 */
export function safeIncomingSpanAttributes(req: {
  url?: string;
}): Record<string, string> {
  const safe = safeUrl(req.url);
  if (safe === undefined) return {};
  const q = safe.indexOf('?');
  return q === -1
    ? { [ATTR_URL_PATH]: safe }
    : {
        [ATTR_URL_PATH]: safe.slice(0, q),
        [ATTR_URL_QUERY]: safe.slice(q + 1),
      };
}

/** Tracing is optional: a failure here must never stop the API booting. */
export function startTelemetry(service: 'api' | 'worker'): NodeSDK | null {
  try {
    return startTelemetryUnsafe(service);
  } catch (err) {
    console.warn(
      `telemetry disabled: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

function startTelemetryUnsafe(service: 'api' | 'worker'): NodeSDK | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return null;
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: `lawbid-${service}`,
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    sampler: samplerFromEnv(),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noisy, low-value spans (docs/06 §8: API → DB → queues is enough).
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
        '@opentelemetry/instrumentation-http': {
          startIncomingSpanHook: (req) => safeIncomingSpanAttributes(req),
        },
      }),
    ],
  });
  sdk.start();
  const stop = () => {
    void sdk.shutdown().catch(() => undefined);
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
  return sdk;
}

import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

/**
 * docs/06 §8 "Трассировка: OpenTelemetry (API → БД → очереди)". Started
 * before Nest loads (see main.ts / worker.ts) so the auto-instrumentation
 * patches http, express, ioredis, pg/prisma and socket.io. Off unless
 * OTEL_EXPORTER_OTLP_ENDPOINT is set (dev/e2e stay untouched); the
 * collector address is the OpenTelemetry Collector sidecar/service of
 * infra (§6.1; modules/ecs `tracing_enabled`, off by default, adds the
 * ADOT sidecar and these env vars; spans go to AWS X-Ray). Sampling is
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
export function buildSampler(ratio: number): tracing.Sampler {
  return new tracing.ParentBasedSampler({
    root: new tracing.TraceIdRatioBasedSampler(ratio),
  });
}

export function startTelemetry(service: 'api' | 'worker'): NodeSDK | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return null;
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: `lawbid-${service}`,
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    sampler: buildSampler(traceSampleRatio()),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Noisy, low-value spans (docs/06 §8: API → DB → queues is enough).
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
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

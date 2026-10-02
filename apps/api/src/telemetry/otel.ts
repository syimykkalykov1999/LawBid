import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
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
 * infra (§6.1). No request bodies or headers are recorded — the
 * instrumentations are left at their defaults and pino redaction covers
 * the logs; spans carry route, status and duration only.
 */
export function startTelemetry(service: 'api' | 'worker'): NodeSDK | null {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return null;
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: `lawbid-${service}`,
      [ATTR_SERVICE_VERSION]: process.env.APP_VERSION ?? 'dev',
    }),
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
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

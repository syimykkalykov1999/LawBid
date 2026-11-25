import {
  buildSampler,
  safeIncomingSpanAttributes,
  samplerFromEnv,
  startTelemetry,
  traceSampleRatio,
} from './otel';
import { isClientError, sentryRates } from './sentry';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

describe('telemetry knobs (S12-2, S12-6)', () => {
  it('samples 5 % of traces by default and clamps the env value', () => {
    expect(traceSampleRatio({})).toBe(0.05);
    expect(traceSampleRatio({ OTEL_TRACES_SAMPLER_ARG: '0.2' })).toBe(0.2);
    expect(traceSampleRatio({ OTEL_TRACES_SAMPLER_ARG: '7' })).toBe(1);
    expect(traceSampleRatio({ OTEL_TRACES_SAMPLER_ARG: 'x' })).toBe(0.05);
  });

  it('builds a parent-based ratio sampler', () => {
    expect(buildSampler(0.05).toString()).toContain('ParentBased');
  });

  // Item 14 (25.11): with tail sampling the collector decides, so the app
  // must record every request — also those a phone marked "not sampled".
  it('records everything when OTEL_TRACES_SAMPLER=always_on (tail sampling)', () => {
    expect(
      samplerFromEnv({ OTEL_TRACES_SAMPLER: 'always_on' }).toString(),
    ).toBe('AlwaysOnSampler');
    expect(
      samplerFromEnv({
        OTEL_TRACES_SAMPLER: 'parentbased_traceidratio',
        OTEL_TRACES_SAMPLER_ARG: '0.05',
      }).toString(),
    ).toContain('ParentBased');
    expect(samplerFromEnv({}).toString()).toContain('ParentBased');
  });

  it('stays off without an endpoint and never throws when the SDK starts', () => {
    const prev = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    try {
      delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      expect(startTelemetry('api')).toBeNull();
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://127.0.0.1:1';
      const sdk = startTelemetry('api');
      if (sdk) void sdk.shutdown().catch(() => undefined);
    } finally {
      if (prev === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
      else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = prev;
    }
  });

  it('keeps Sentry traces off and errors at 100 % unless told otherwise', () => {
    expect(sentryRates({})).toEqual({ sampleRate: 1, tracesSampleRate: 0 });
    expect(
      sentryRates({
        SENTRY_SAMPLE_RATE: '0.5',
        SENTRY_TRACES_SAMPLE_RATE: '0.02',
      }),
    ).toEqual({ sampleRate: 0.5, tracesSampleRate: 0.02 });
  });

  it('drops 4xx HTTP exceptions, keeps 5xx and unknown errors', () => {
    expect(
      isClientError({ originalException: new BadRequestException() }),
    ).toBe(true);
    expect(
      isClientError({ originalException: new InternalServerErrorException() }),
    ).toBe(false);
    expect(isClientError({ originalException: new Error('boom') })).toBe(false);
    expect(isClientError({})).toBe(false);
  });
});

// Detective R2B-6 (14.11): server spans carry the same safe URL as the
// logs — token paths redacted, query values dropped (search text, `?t=`).
describe('safeIncomingSpanAttributes (R2B-6)', () => {
  it('replaces url.path and url.query with the safe form', () => {
    expect(
      safeIncomingSpanAttributes({
        url: '/api/v1/calendar/feed/lbc_secret.ics?t=ring_ticket&q=john+doe',
      }),
    ).toEqual({
      'url.path': '/api/v1/calendar/feed/[REDACTED]',
      'url.query': 't&q',
    });
  });

  it('no query: the path only', () => {
    expect(safeIncomingSpanAttributes({ url: '/api/v1/cases' })).toEqual({
      'url.path': '/api/v1/cases',
    });
    expect(safeIncomingSpanAttributes({})).toEqual({});
  });
});

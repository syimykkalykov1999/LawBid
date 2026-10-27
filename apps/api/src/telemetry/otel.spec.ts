import { buildSampler, traceSampleRatio } from './otel';
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

import { ApiProperty } from '@nestjs/swagger';

export class ClientTimingsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: { type: 'number' },
    description:
      'Live-connection timings the app must use (set in the admin, Config → realtime.*): reconnectMinMs, reconnectMaxMs, reconnectJitter (0–1), serverDisconnectMinWaitMs, serverDisconnectMaxWaitMs, offlineFailures, offlineSeconds, probeTimeoutMs, tokenRefreshLeadSeconds, pollingFallbackIntervalSeconds, reconnectedDebounceSeconds, refetchJitterMs, pingIntervalMs, pingTimeoutMs. See docs/runbooks/REALTIME_LIFECYCLE.md.',
  })
  timings!: Record<string, number>;
}

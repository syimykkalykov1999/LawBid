import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventRecord } from './domain-event.types';

/** Where the `stream` sink ships events (Kinesis Data Streams today). */
export abstract class EventStreamPublisher {
  /** True when a stream is configured (EVENTS_STREAM_NAME set by Terraform). */
  abstract available(): boolean;
  abstract publish(events: readonly DomainEventRecord[]): Promise<void>;
}

/**
 * Kinesis adapter. `@aws-sdk/client-kinesis` is a hard dependency of the API
 * (package.json; guarded by event-stream.deps.spec.ts). It is loaded lazily
 * only to keep it out of the cold start while `events_stream_enabled=false`.
 * A failed publish leaves the rows unpublished (the table keeps them, nothing
 * is lost).
 */
@Injectable()
export class KinesisEventStreamPublisher extends EventStreamPublisher {
  private readonly log = new Logger(KinesisEventStreamPublisher.name);
  private sdk?: {
    client: import('@aws-sdk/client-kinesis').KinesisClient;
    PutRecordsCommand: typeof import('@aws-sdk/client-kinesis').PutRecordsCommand;
  };

  private name(): string {
    return (process.env.EVENTS_STREAM_NAME ?? '').trim();
  }

  available(): boolean {
    return this.name().length > 0;
  }

  async publish(events: readonly DomainEventRecord[]): Promise<void> {
    if (events.length === 0) return;
    if (!this.sdk) {
      // Literal specifier: tsc and the bundler see the dependency (a computed
      // name hid its absence). Still lazy: loaded on the first publish only.
      const { KinesisClient, PutRecordsCommand } =
        await import('@aws-sdk/client-kinesis');
      // Set only after the client exists: a throwing constructor is retried.
      this.sdk = {
        client: new KinesisClient({ region: process.env.AWS_REGION }),
        PutRecordsCommand,
      };
    }
    const res = await this.sdk.client.send(
      new this.sdk.PutRecordsCommand({
        StreamName: this.name(),
        Records: events.map((e) => ({
          // Same actor / type stays ordered inside one shard.
          PartitionKey: e.actorId ?? e.type,
          Data: Buffer.from(JSON.stringify(e)),
        })),
      }),
    );
    if (res.FailedRecordCount) {
      this.log.warn(`kinesis: ${res.FailedRecordCount} records failed`);
      throw new Error('kinesis partial failure');
    }
  }
}

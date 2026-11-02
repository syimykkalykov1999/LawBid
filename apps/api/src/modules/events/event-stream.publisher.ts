import { Injectable, Logger } from '@nestjs/common';
import type { DomainEventRecord } from './domain-event.types';

/** Where the `stream` sink ships events (Kinesis Data Streams today). */
export abstract class EventStreamPublisher {
  /** True when a stream is configured (EVENTS_STREAM_NAME set by Terraform). */
  abstract available(): boolean;
  abstract publish(events: readonly DomainEventRecord[]): Promise<void>;
}

interface KinesisModule {
  KinesisClient: new (cfg: { region?: string }) => {
    send(cmd: unknown): Promise<{ FailedRecordCount?: number }>;
  };
  PutRecordsCommand: new (input: unknown) => unknown;
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
  private client?: InstanceType<KinesisModule['KinesisClient']>;
  private mod?: KinesisModule;

  private name(): string {
    return (process.env.EVENTS_STREAM_NAME ?? '').trim();
  }

  available(): boolean {
    return this.name().length > 0;
  }

  async publish(events: readonly DomainEventRecord[]): Promise<void> {
    if (events.length === 0) return;
    if (!this.mod) {
      const pkg = '@aws-sdk/client-kinesis';
      const mod = (await import(pkg)) as KinesisModule;
      // Assign only after the client exists: a throwing constructor must be
      // retried on the next publish, not leave `mod` set with no client.
      this.client = new mod.KinesisClient({ region: process.env.AWS_REGION });
      this.mod = mod;
    }
    const res = await this.client!.send(
      new this.mod.PutRecordsCommand({
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

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
 * Kinesis adapter. The SDK package is loaded lazily so the API builds and
 * runs without it while `events_stream_enabled=false`; if the stream is
 * configured but the package is missing, publishing fails loudly and rows
 * simply stay unpublished (the table keeps them, nothing is lost).
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
      this.mod = (await import(pkg)) as KinesisModule;
      this.client = new this.mod.KinesisClient({
        region: process.env.AWS_REGION,
      });
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

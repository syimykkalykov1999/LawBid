import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { opsCredentials } from '../../common/ops/ops-credentials';
import type {
  Ec2State,
  TurnInstanceInfo,
  TurnInstancePort,
} from './turn-on-demand';

interface Ec2ClientLike {
  send(command: unknown): Promise<{
    Reservations?: Array<{
      Instances?: Array<{
        State?: { Name?: string };
        PublicIpAddress?: string;
      }>;
    }>;
  }>;
}
interface Ec2ModuleLike {
  EC2Client: new (cfg: {
    region: string;
    credentials?: ReturnType<typeof opsCredentials>;
  }) => Ec2ClientLike;
  DescribeInstancesCommand: new (input: { InstanceIds: string[] }) => unknown;
  StartInstancesCommand: new (input: { InstanceIds: string[] }) => unknown;
  StopInstancesCommand: new (input: { InstanceIds: string[] }) => unknown;
}

/**
 * Owner 2026-11-02: the on-demand coturn box. Terraform passes
 * TURN_ONDEMAND_INSTANCE_ID (empty = the feature is off) and lets the ops role
 * (or the API task role while ops_role_split is off) Describe / Start / Stop
 * exactly that one instance. The SDK is
 * loaded on first use so nothing else pays for it (and a Mac without AWS
 * never touches it).
 */
@Injectable()
export class TurnInstanceGateway implements TurnInstancePort {
  private client?: Ec2ClientLike;
  private mod?: Ec2ModuleLike;

  constructor(private readonly config: ConfigService) {}

  /** The instance id, or undefined when the feature is off. */
  get instanceId(): string | undefined {
    const v = this.config.get<string>('TURN_ONDEMAND_INSTANCE_ID');
    return v && v.trim().length > 0 ? v.trim() : undefined;
  }

  get enabled(): boolean {
    return this.instanceId !== undefined;
  }

  private async sdk(): Promise<{ mod: Ec2ModuleLike; client: Ec2ClientLike }> {
    if (!this.mod || !this.client) {
      this.mod = await import('@aws-sdk/client-ec2');
      const region =
        this.config.get<string>('AWS_REGION') ??
        this.config.get<string>('AWS_DEFAULT_REGION') ??
        'us-east-1';
      // S4-1: with ops_role_split the Start / Stop right sits on the separate
      // ops role (OPS_ROLE_ARN), not on the task role of the public API.
      this.client = new this.mod.EC2Client({
        region,
        credentials: opsCredentials((n) => this.config.get<string>(n), region),
      });
    }
    return { mod: this.mod, client: this.client };
  }

  private need(): string {
    const id = this.instanceId;
    if (!id) throw new Error('TURN_ONDEMAND_INSTANCE_ID is not set');
    return id;
  }

  async describe(): Promise<TurnInstanceInfo> {
    const id = this.need();
    const { mod, client } = await this.sdk();
    const out = await client.send(
      new mod.DescribeInstancesCommand({ InstanceIds: [id] }),
    );
    const inst = out.Reservations?.[0]?.Instances?.[0];
    return {
      state: (inst?.State?.Name ?? 'terminated') as Ec2State,
      publicIp: inst?.PublicIpAddress,
    };
  }

  async start(): Promise<void> {
    const id = this.need();
    const { mod, client } = await this.sdk();
    await client.send(new mod.StartInstancesCommand({ InstanceIds: [id] }));
  }

  async stop(): Promise<void> {
    const id = this.need();
    const { mod, client } = await this.sdk();
    await client.send(new mod.StopInstancesCommand({ InstanceIds: [id] }));
  }
}

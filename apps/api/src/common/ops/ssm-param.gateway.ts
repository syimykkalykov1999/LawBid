import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type SsmTarget = 'db' | 'redis';

/** The two Lambda-owned autoscale switches the admin may change. */
export type SsmMode = 'on' | 'dry-run' | 'off';

interface SsmClientLike {
  send(command: unknown): Promise<{ Parameter?: { Value?: string } }>;
}
interface SsmModuleLike {
  SSMClient: new (cfg: { region: string }) => SsmClientLike;
  GetParameterCommand: new (input: { Name: string }) => unknown;
  PutParameterCommand: new (input: {
    Name: string;
    Value: string;
    Type: 'String';
    Overwrite: true;
  }) => unknown;
}

/**
 * Cost registry (owner 2026-10-25): the autoscaler Lambdas keep their
 * on / dry-run / off switch and their money ceiling in AWS SSM Parameter
 * Store (infra/modules/{db,redis}-autoscale). Terraform passes the four
 * parameter NAMES in OPS_{DB,REDIS}_AUTOSCALE_{MODE,MAXCLASS}_PARAM (empty
 * when that autoscaler does not exist) and lets the API task role read and
 * write exactly those. Without the names (a developer's Mac, CI) every call
 * says «not available».
 *
 * The SDK client is loaded on first use so nothing else pays for it (and a
 * Mac without AWS never touches it).
 */
@Injectable()
export class SsmParamGateway {
  private client?: SsmClientLike;
  private mod?: SsmModuleLike;

  constructor(private readonly config: ConfigService) {}

  private env(name: string): string | undefined {
    const v = this.config.get<string>(name);
    return v && v.length > 0 ? v : undefined;
  }

  modeParam(target: SsmTarget): string | undefined {
    return this.env(
      target === 'db'
        ? 'OPS_DB_AUTOSCALE_MODE_PARAM'
        : 'OPS_REDIS_AUTOSCALE_MODE_PARAM',
    );
  }

  maxClassParam(target: SsmTarget): string | undefined {
    return this.env(
      target === 'db'
        ? 'OPS_DB_AUTOSCALE_MAXCLASS_PARAM'
        : 'OPS_REDIS_AUTOSCALE_MAXCLASS_PARAM',
    );
  }

  get available(): boolean {
    return (
      !!this.modeParam('db') ||
      !!this.modeParam('redis') ||
      !!this.maxClassParam('db') ||
      !!this.maxClassParam('redis')
    );
  }

  // eslint-disable-next-line @typescript-eslint/require-await -- kept async for callers
  private async load(): Promise<SsmModuleLike> {
    if (!this.mod) {
      // Non-literal specifier: the package is a runtime dependency of the
      // API image, not something every unit test has to resolve.
      const spec = '@aws-sdk/client-ssm';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      this.mod = require(spec) as SsmModuleLike;
      this.client = new this.mod.SSMClient({
        region: this.env('AWS_REGION') ?? this.env('S3_REGION') ?? 'us-east-1',
      });
    }
    return this.mod;
  }

  async get(name: string): Promise<string | null> {
    const m = await this.load();
    try {
      const res = await this.client!.send(
        new m.GetParameterCommand({ Name: name }),
      );
      return res.Parameter?.Value?.trim() ?? null;
    } catch (e) {
      if ((e as { name?: string }).name === 'ParameterNotFound') return null;
      throw e;
    }
  }

  async put(name: string, value: string): Promise<void> {
    const m = await this.load();
    await this.client!.send(
      new m.PutParameterCommand({
        Name: name,
        Value: value,
        Type: 'String',
        Overwrite: true,
      }),
    );
  }

  async getMode(target: SsmTarget): Promise<SsmMode | null> {
    const name = this.modeParam(target);
    if (!name) return null;
    const v = await this.get(name);
    return v === 'on' || v === 'dry-run' || v === 'off' ? v : null;
  }

  async setMode(target: SsmTarget, mode: SsmMode): Promise<void> {
    const name = this.modeParam(target);
    if (!name) throw new Error('autoscaler is not on AWS');
    await this.put(name, mode);
  }
}

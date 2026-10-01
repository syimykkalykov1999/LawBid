import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IntegrationCredential } from '@prisma/client';
import type Redis from 'ioredis';
import { ErrorCode } from '../errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import { withTxRetry } from '../../prisma/tx-retry.util';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import {
  PROVIDERS,
  providerById,
  type ProviderDefinition,
} from './provider-registry';
import { maskSecret, SecretEnvelope } from './secret-envelope';

export interface ResolvedCredentials {
  source: 'db' | 'env';
  version: number | null;
  fingerprint: string;
  fields: Record<string, string>;
}

/** A tested version may be activated for this long. */
const TEST_FRESH_MS = 10 * 60_000;
/** Safety net if a pub/sub message is missed. */
const CACHE_MS = 60_000;
const CHANNEL = 'secrets:changed';

/**
 * Owner 2026-10-01: the API keys the owner manages in the admin. Services
 * ask `get(provider)` at call time: the active DB version (decrypted, kept
 * only in memory) or — only while no version is active — the env vars.
 * A change is published on Redis so every API / worker process drops its
 * cache at once; nothing needs a restart (except Sentry). New keys wait
 * as `pending` until tested and activated, so a typo never reaches the
 * running app; the previous version stays for a one-step rollback.
 */
@Injectable()
export class SecretsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecretsService.name);
  private readonly envelope: SecretEnvelope | null;
  private readonly cache = new Map<
    string,
    { at: number; value: ResolvedCredentials | null }
  >();
  private sub?: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    const keys = this.config.get<string>('SECRETS_MASTER_KEYS');
    const kid = this.config.get<string>('SECRETS_ACTIVE_KID');
    this.envelope = keys && kid ? new SecretEnvelope(keys, kid) : null;
  }

  /** The admin can store keys only with a master key configured. */
  get enabled(): boolean {
    return this.envelope !== null;
  }

  async onModuleInit(): Promise<void> {
    if (typeof this.redis.duplicate !== 'function') return;
    try {
      this.sub = this.redis.duplicate();
      await this.sub.subscribe(CHANNEL);
      this.sub.on('message', (_channel: string, provider: string) => {
        this.cache.delete(provider);
      });
    } catch (e) {
      this.logger.warn(`secrets pub/sub unavailable: ${String(e)}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.sub?.quit();
    } catch {
      this.sub?.disconnect();
    }
  }

  // --- runtime ---------------------------------------------------------------

  async get(provider: string): Promise<ResolvedCredentials | null> {
    const hit = this.cache.get(provider);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await this.resolve(provider);
    this.cache.set(provider, { at: Date.now(), value });
    return value;
  }

  /** One field, or undefined. */
  async field(provider: string, name: string): Promise<string | undefined> {
    return (await this.get(provider))?.fields[name];
  }

  /** Every listed field is configured (DB or env). */
  async has(provider: string, fields?: string[]): Promise<boolean> {
    const def = providerById(provider);
    const c = await this.get(provider);
    if (!def || !c) return false;
    const need =
      fields ?? def.fields.filter((f) => f.required).map((f) => f.name);
    return need.every((n) => (c.fields[n] ?? '').length > 0);
  }

  private async resolve(provider: string): Promise<ResolvedCredentials | null> {
    const def = providerById(provider);
    if (!def) return null;
    if (this.envelope) {
      const row = await this.prisma.integrationCredential.findFirst({
        where: { provider, status: 'active' },
      });
      // An active DB version wins — no silent fallback to env.
      if (row) {
        try {
          return {
            source: 'db',
            version: row.version,
            fingerprint: row.fingerprint,
            fields: this.fieldsOf(row),
          };
        } catch (e) {
          this.logger.error(
            `cannot decrypt ${provider} v${row.version}: ${String(e)}`,
          );
          return null;
        }
      }
    }
    const fields: Record<string, string> = {};
    for (const f of def.fields) {
      const v = f.env ? this.config.get<string>(f.env) : undefined;
      if (typeof v === 'string' && v.length > 0) fields[f.name] = v;
    }
    if (Object.keys(fields).length === 0) return null;
    return {
      source: 'env',
      version: null,
      fingerprint: `env:${Object.keys(fields).sort().join(',')}`,
      fields,
    };
  }

  private fieldsOf(row: IntegrationCredential): Record<string, string> {
    const secrets = JSON.parse(
      this.envelope!.decrypt(row.secret_enc, aad(row.provider, row.version)),
    ) as Record<string, string>;
    return {
      ...(row.public_config as Record<string, string>),
      ...secrets,
    };
  }

  private async changed(provider: string): Promise<void> {
    this.cache.delete(provider);
    try {
      await this.redis.publish(CHANNEL, provider);
    } catch (e) {
      this.logger.warn(`secrets publish failed: ${String(e)}`);
    }
  }

  // --- admin -------------------------------------------------------------

  private needEnvelope(): SecretEnvelope {
    if (!this.envelope) {
      throw new ServiceUnavailableException({
        code: ErrorCode.INTEGRATIONS_NOT_CONFIGURED,
        message:
          'Set SECRETS_MASTER_KEYS and SECRETS_ACTIVE_KID on the server first.',
      });
    }
    return this.envelope;
  }

  private def(provider: string): ProviderDefinition {
    const d = providerById(provider);
    if (!d) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Unknown integration.',
      });
    }
    return d;
  }

  /** Every provider with where its keys come from — never the values. */
  async overview() {
    const rows = await this.prisma.integrationCredential.findMany({
      where: { status: { in: ['active', 'pending'] } },
      orderBy: { version: 'desc' },
    });
    return Promise.all(
      PROVIDERS.map(async (d) => {
        const active = rows.find(
          (r) => r.provider === d.id && r.status === 'active',
        );
        const pending = rows.find(
          (r) => r.provider === d.id && r.status === 'pending',
        );
        const resolved = await this.get(d.id);
        return {
          provider: d.id,
          label: d.label,
          description: d.description,
          restartRequired: d.restartRequired ?? false,
          warning: d.warning ?? null,
          testable: Boolean(d.test),
          fields: d.fields.map((f) => ({
            name: f.name,
            label: f.label,
            secret: f.secret,
            required: f.required,
            hint: f.patternHint ?? null,
          })),
          source: resolved?.source ?? 'none',
          configured: await this.has(d.id),
          active: active ? this.summary(active) : null,
          pending: pending ? this.summary(pending) : null,
          envMasked:
            resolved?.source === 'env'
              ? Object.fromEntries(
                  d.fields
                    .filter((f) => resolved.fields[f.name])
                    .map((f) => [
                      f.name,
                      f.secret
                        ? maskSecret(resolved.fields[f.name])
                        : resolved.fields[f.name],
                    ]),
                )
              : null,
        };
      }),
    );
  }

  async versions(provider: string) {
    this.def(provider);
    const rows = await this.prisma.integrationCredential.findMany({
      where: { provider },
      orderBy: { version: 'desc' },
      take: 20,
    });
    return rows.map((r) => this.summary(r));
  }

  summary(r: IntegrationCredential) {
    return {
      id: r.id,
      version: r.version,
      status: r.status,
      masked: r.masked as Record<string, string>,
      fingerprint: r.fingerprint,
      createdAt: r.created_at.toISOString(),
      activatedAt: r.activated_at?.toISOString() ?? null,
      lastTestAt: r.last_test_at?.toISOString() ?? null,
      lastTestOk: r.last_test_ok,
      lastTestError: r.last_test_error,
    };
  }

  /**
   * A new `pending` version. A blank secret field keeps the value of the
   * newest version (so changing one price id doesn't need the key again).
   */
  async createVersion(
    provider: string,
    input: Record<string, string>,
    adminId: string | null,
  ) {
    const env = this.needEnvelope();
    const def = this.def(provider);
    const latest = await this.prisma.integrationCredential.findFirst({
      where: { provider },
      orderBy: { version: 'desc' },
    });
    const previous = latest ? this.fieldsOf(latest) : {};
    const values: Record<string, string> = {};
    for (const f of def.fields) {
      const raw = (input[f.name] ?? '').trim();
      const v = raw.length > 0 ? raw : (previous[f.name] ?? '');
      if (!v) {
        if (f.required) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_ERROR,
            message: `${f.label} is required.`,
            details: { field: f.name },
          });
        }
        continue;
      }
      if (f.pattern && !f.pattern.test(v)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `${f.label} has the wrong format${
            f.patternHint ? ` (${f.patternHint})` : ''
          }.`,
          details: { field: f.name },
        });
      }
      values[f.name] = v;
    }
    // Live Stripe keys only in production (same rule as the env).
    if (
      provider === 'stripe' &&
      /_live_/.test(values.secretKey ?? '') &&
      this.config.get<string>('NODE_ENV') !== 'production'
    ) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Live Stripe keys are allowed only in production.',
        details: { field: 'secretKey' },
      });
    }
    const secretPart: Record<string, string> = {};
    const publicPart: Record<string, string> = {};
    const masked: Record<string, string> = {};
    for (const f of def.fields) {
      const v = values[f.name];
      if (v === undefined) continue;
      if (f.secret) {
        secretPart[f.name] = v;
        masked[f.name] = maskSecret(v);
      } else {
        publicPart[f.name] = v;
        masked[f.name] = v;
      }
    }
    const version = (latest?.version ?? 0) + 1;
    const plain = JSON.stringify(secretPart);
    try {
      const row = await this.prisma.integrationCredential.create({
        data: {
          provider,
          version,
          status: 'pending',
          secret_enc: env.encrypt(plain, aad(provider, version)),
          kid: env.activeKid,
          public_config: publicPart,
          masked,
          fingerprint: env.fingerprint(
            `${provider}:${plain}:${JSON.stringify(publicPart)}`,
          ),
          created_by: adminId,
        },
      });
      // A newer pending version replaces an older untested one.
      await this.prisma.integrationCredential.updateMany({
        where: { provider, status: 'pending', version: { lt: version } },
        data: { status: 'retired', retired_at: new Date() },
      });
      return this.summary(row);
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: ErrorCode.INTEGRATION_CONFLICT,
          message: 'Saved by someone else at the same time — reload.',
        });
      }
      throw e;
    }
  }

  async test(provider: string, version: number) {
    this.needEnvelope();
    const def = this.def(provider);
    const row = await this.row(provider, version);
    let ok = true;
    let error: string | null = null;
    if (def.test) {
      try {
        await def.test(this.fieldsOf(row));
      } catch (e) {
        ok = false;
        error = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      }
    }
    const updated = await this.prisma.integrationCredential.update({
      where: { id: row.id },
      data: {
        last_test_at: new Date(),
        last_test_ok: ok,
        last_test_error: error,
      },
    });
    return this.summary(updated);
  }

  /** Makes [version] live; the previous active one is kept (retired). */
  async activate(provider: string, version: number, force = false) {
    this.needEnvelope();
    const def = this.def(provider);
    const row = await this.row(provider, version);
    const fresh =
      row.last_test_ok === true &&
      row.last_test_at !== null &&
      Date.now() - row.last_test_at.getTime() < TEST_FRESH_MS;
    if (def.test && !fresh && !force) {
      throw new ConflictException({
        code: ErrorCode.INTEGRATION_CONFLICT,
        message: 'Run "Test connection" successfully first (or force).',
      });
    }
    const now = new Date();
    await withTxRetry(this.prisma, async (tx) => {
      await tx.integrationCredential.updateMany({
        where: { provider, status: 'active' },
        data: { status: 'retired', retired_at: now },
      });
      await tx.integrationCredential.update({
        where: { id: row.id },
        data: { status: 'active', activated_at: now, retired_at: null },
      });
    });
    await this.changed(provider);
    return this.summary(await this.row(provider, version));
  }

  /** Back to the version that was active before the current one. */
  async rollback(provider: string) {
    this.needEnvelope();
    this.def(provider);
    const current = await this.prisma.integrationCredential.findFirst({
      where: { provider, status: 'active' },
    });
    const previous = await this.prisma.integrationCredential.findFirst({
      where: {
        provider,
        status: 'retired',
        activated_at: { not: null },
        ...(current ? { version: { lt: current.version } } : {}),
      },
      orderBy: { version: 'desc' },
    });
    if (!previous) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'There is no earlier version to go back to.',
      });
    }
    return this.activate(provider, previous.version, true);
  }

  /** Stops using the DB keys of [provider] (back to env or "not set"). */
  async remove(provider: string): Promise<void> {
    this.needEnvelope();
    this.def(provider);
    await this.prisma.integrationCredential.updateMany({
      where: { provider, status: { in: ['active', 'pending'] } },
      data: { status: 'retired', retired_at: new Date() },
    });
    await this.changed(provider);
  }

  /** After adding a new master key: re-encrypts rows under the old kids. */
  async reencrypt(): Promise<number> {
    const env = this.needEnvelope();
    const rows = await this.prisma.integrationCredential.findMany({
      where: { kid: { not: env.activeKid } },
    });
    for (const r of rows) {
      const plain = env.decrypt(r.secret_enc, aad(r.provider, r.version));
      await this.prisma.integrationCredential.update({
        where: { id: r.id },
        data: {
          secret_enc: env.encrypt(plain, aad(r.provider, r.version)),
          kid: env.activeKid,
        },
      });
    }
    for (const p of new Set(rows.map((r) => r.provider))) {
      await this.changed(p);
    }
    return rows.length;
  }

  private async row(provider: string, version: number) {
    const row = await this.prisma.integrationCredential.findUnique({
      where: { provider_version: { provider, version } },
    });
    if (!row) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No such version.',
      });
    }
    return row;
  }
}

const aad = (provider: string, version: number) => `${provider}:${version}`;

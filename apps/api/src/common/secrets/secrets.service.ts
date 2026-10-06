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
  cleanPasted,
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
  /** Owner 2026-10-05: which key set ("main", "backup"…); null for env. */
  slot: string | null;
  label: string | null;
}

export const MAIN_SLOT = 'main';
export const SLOT_PATTERN = /^[a-z0-9_-]{1,30}$/;
export const CUSTOM_PREFIX = 'custom_';
/** A key set that just failed is skipped for this long. */
const FAILURE_COOLDOWN_MS = 5 * 60_000;
const CUSTOM_CHANNEL_KEY = '__custom__';

export interface CustomFieldInput {
  name: string;
  label: string;
  secret: boolean;
  required: boolean;
}

export interface SlotPatch {
  label?: string | null;
  enabled?: boolean;
  priority?: number;
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
    { at: number; value: ResolvedCredentials[] }
  >();
  /** `${provider}|${fingerprint}` → skipped until (a failed key set). */
  private readonly cooldown = new Map<string, number>();
  private custom: { at: number; defs: Map<string, ProviderDefinition> } | null =
    null;
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
        if (provider === CUSTOM_CHANNEL_KEY) this.custom = null;
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

  private storeDownUntil = 0;

  /** The key set to use now: the first enabled one that hasn't just
   * failed (all failed → the first anyway). */
  async get(provider: string): Promise<ResolvedCredentials | null> {
    return (await this.getAll(provider))[0] ?? null;
  }

  /**
   * Owner 2026-10-05: every usable key set of [provider] in the order to
   * try them — enabled DB sets by priority (ones that failed in the last
   * few minutes last), or the env keys while no DB set is active.
   */
  async getAll(provider: string): Promise<ResolvedCredentials[]> {
    const hit = this.cache.get(provider);
    let list: ResolvedCredentials[];
    if (hit && Date.now() - hit.at < CACHE_MS) {
      list = hit.value;
    } else {
      list = await this.resolve(provider);
      this.cache.set(provider, { at: Date.now(), value: list });
    }
    if (list.length < 2) return list;
    const now = Date.now();
    const cool = (c: ResolvedCredentials) =>
      (this.cooldown.get(`${provider}|${c.fingerprint}`) ?? 0) > now;
    return [...list.filter((c) => !cool(c)), ...list.filter(cool)];
  }

  /** A call with this key set failed: the next one is tried first for a
   * few minutes. */
  reportFailure(provider: string, fingerprint: string): void {
    this.cooldown.set(
      `${provider}|${fingerprint}`,
      Date.now() + FAILURE_COOLDOWN_MS,
    );
  }

  /**
   * Runs [fn] with the first key set; on an error marks it failed and
   * tries the next one. Throws the last error when every set failed, or
   * returns null when nothing is configured.
   */
  async withFallback<T>(
    provider: string,
    fn: (c: ResolvedCredentials) => Promise<T>,
  ): Promise<T | null> {
    const sets = await this.getAll(provider);
    let last: unknown = null;
    for (const c of sets) {
      try {
        return await fn(c);
      } catch (e) {
        last = e;
        if (sets.length > 1) {
          this.reportFailure(provider, c.fingerprint);
          this.logger.warn(
            `${provider} key set "${c.slot ?? 'env'}" failed, trying the next: ${String(e)}`,
          );
        }
      }
    }
    if (last !== null) {
      throw last instanceof Error ? last : new Error('key set failed');
    }
    return null;
  }

  /** One field, or undefined. */
  async field(provider: string, name: string): Promise<string | undefined> {
    return (await this.get(provider))?.fields[name];
  }

  /** Every listed field is configured (DB or env). */
  async has(provider: string, fields?: string[]): Promise<boolean> {
    const def = await this.defOf(provider);
    const c = await this.get(provider);
    if (!def || !c) return false;
    const need =
      fields ?? def.fields.filter((f) => f.required).map((f) => f.name);
    return need.every((n) => (c.fields[n] ?? '').length > 0);
  }

  /** A built-in service, or one the owner added in the admin. */
  async defOf(provider: string): Promise<ProviderDefinition | undefined> {
    const builtIn = providerById(provider);
    if (builtIn || !provider.startsWith(CUSTOM_PREFIX)) return builtIn;
    return (await this.customDefs()).get(provider);
  }

  private async customDefs(): Promise<Map<string, ProviderDefinition>> {
    if (this.custom && Date.now() - this.custom.at < CACHE_MS) {
      return this.custom.defs;
    }
    const defs = new Map<string, ProviderDefinition>();
    try {
      const rows = await this.prisma.integrationCustomProvider.findMany({
        orderBy: { created_at: 'asc' },
      });
      for (const r of rows) defs.set(r.id, customDefinition(r));
    } catch (e) {
      this.logger.error(`custom services unavailable: ${String(e)}`);
    }
    this.custom = { at: Date.now(), defs };
    return defs;
  }

  private async resolve(provider: string): Promise<ResolvedCredentials[]> {
    const def = await this.defOf(provider);
    if (!def) return [];
    if (this.envelope) {
      const rows = await this.activeRows(provider);
      // Active DB sets win — no silent fallback to env.
      if (rows.length > 0) {
        const out: ResolvedCredentials[] = [];
        for (const row of rows) {
          if (!row.enabled) continue;
          try {
            out.push({
              source: 'db',
              version: row.version,
              fingerprint: row.fingerprint,
              fields: this.fieldsOf(row),
              slot: row.slot,
              label: row.label,
            });
          } catch (e) {
            this.logger.error(
              `cannot decrypt ${provider} v${row.version}: ${String(e)}`,
            );
          }
        }
        return out;
      }
    }
    const fields: Record<string, string> = {};
    for (const f of def.fields) {
      const v = f.env ? this.config.get<string>(f.env) : undefined;
      if (typeof v === 'string' && v.length > 0) fields[f.name] = v;
    }
    if (Object.keys(fields).length === 0) return [];
    return [
      {
        source: 'env',
        version: null,
        fingerprint: `env:${Object.keys(fields).sort().join(',')}`,
        fields,
        slot: null,
        label: null,
      },
    ];
  }

  /** The active DB versions (one per key set, priority order), or none
   * when the key store does not answer within a couple of seconds (a
   * damaged table must never freeze every request: the env keys are used
   * instead and the store is retried a minute later). */
  private async activeRows(provider: string): Promise<IntegrationCredential[]> {
    if (Date.now() < this.storeDownUntil) return [];
    try {
      // The database cancels the query itself after 2 s (statement_timeout),
      // so a damaged table frees its connection instead of piling up hung
      // queries until the pool is exhausted.
      return await this.prisma.$transaction(
        async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = '2000ms'`);
          return tx.integrationCredential.findMany({
            where: { provider, status: 'active' },
            orderBy: [{ priority: 'asc' }, { slot: 'asc' }],
          });
        },
        { timeout: 5000, maxWait: 3000 },
      );
    } catch (e) {
      this.storeDownUntil = Date.now() + 60_000;
      this.logger.error(`key store unavailable, using env keys: ${String(e)}`);
      return [];
    }
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

  private async def(provider: string): Promise<ProviderDefinition> {
    const d = await this.defOf(provider);
    if (!d) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Unknown integration.',
      });
    }
    return d;
  }

  /** Every provider (built-in, then added in the admin) with where its
   * keys come from and its key sets — never the values. */
  async overview() {
    const rows = await this.prisma.integrationCredential.findMany({
      where: { status: { in: ['active', 'pending'] } },
      orderBy: { version: 'desc' },
    });
    const custom = await this.customDefs();
    const defs = [...PROVIDERS, ...custom.values()];
    return Promise.all(
      defs.map(async (d) => {
        const mine = rows.filter((r) => r.provider === d.id);
        const slots = slotsOf(mine).map((slot) => {
          const active = mine.find(
            (r) => r.slot === slot && r.status === 'active',
          );
          const pending = mine.find(
            (r) => r.slot === slot && r.status === 'pending',
          );
          const meta = active ?? pending!;
          return {
            slot,
            label: meta.label,
            priority: meta.priority,
            enabled: meta.enabled,
            active: active ? this.summary(active) : null,
            pending: pending ? this.summary(pending) : null,
          };
        });
        slots.sort((a, b) => a.priority - b.priority || cmp(a.slot, b.slot));
        const first = slots[0] ?? null;
        const resolved = await this.get(d.id);
        const source: 'db' | 'env' | 'none' = resolved?.source ?? 'none';
        return {
          provider: d.id,
          label: d.label,
          description: d.description,
          custom: d.id.startsWith(CUSTOM_PREFIX),
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
          source,
          configured: await this.has(d.id),
          active: first?.active ?? null,
          pending: first?.pending ?? null,
          slots,
          inUse: resolved?.slot ?? null,
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
    await this.def(provider);
    const rows = await this.prisma.integrationCredential.findMany({
      where: { provider },
      orderBy: { version: 'desc' },
      take: 40,
    });
    return rows.map((r) => this.summary(r));
  }

  summary(r: IntegrationCredential) {
    return {
      id: r.id,
      version: r.version,
      status: r.status,
      slot: r.slot,
      label: r.label,
      priority: r.priority,
      enabled: r.enabled,
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
   * A new `pending` version of key set [slot] (default "main"; a new name
   * adds a set after the existing ones). A blank secret field keeps the
   * value of the newest version of the same set.
   */
  async createVersion(
    provider: string,
    input: Record<string, string>,
    adminId: string | null,
    opts: { slot?: string; label?: string | null } = {},
  ) {
    const env = this.needEnvelope();
    const def = await this.def(provider);
    const slot = (opts.slot ?? MAIN_SLOT).trim().toLowerCase();
    if (!SLOT_PATTERN.test(slot)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Key set name: latin letters, digits, - or _ (≤ 30).',
        details: { field: 'slot' },
      });
    }
    const latest = await this.prisma.integrationCredential.findFirst({
      where: { provider },
      orderBy: { version: 'desc' },
    });
    const latestInSlot = await this.prisma.integrationCredential.findFirst({
      where: { provider, slot },
      orderBy: { version: 'desc' },
    });
    const previous = latestInSlot ? this.fieldsOf(latestInSlot) : {};
    const values: Record<string, string> = {};
    for (const f of def.fields) {
      const typed = cleanPasted(input[f.name] ?? '');
      const raw = typed && f.normalize ? f.normalize(typed) : typed;
      const v = raw.length > 0 ? raw : (previous[f.name] ?? '');
      // details.reason lets the admin say in plain words what is wrong
      // under the exact field (owner 2026-10-06).
      if (!v) {
        if (f.required) {
          throw new BadRequestException({
            code: ErrorCode.VALIDATION_ERROR,
            message: `${f.label} is required.`,
            details: { field: f.name, reason: 'required' },
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
          details: { field: f.name, reason: 'format' },
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
        details: { field: 'secretKey', reason: 'live_not_allowed' },
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
    // A new set goes after the existing ones; an existing one keeps its
    // place, name and on/off switch.
    let priority = latestInSlot?.priority ?? 0;
    if (!latestInSlot) {
      const last = await this.prisma.integrationCredential.findFirst({
        where: { provider },
        orderBy: { priority: 'desc' },
        select: { priority: true },
      });
      priority = last ? last.priority + 1 : 0;
    }
    const label =
      opts.label !== undefined
        ? (opts.label?.trim().slice(0, 60) ?? null) || null
        : (latestInSlot?.label ?? null);
    const version = (latest?.version ?? 0) + 1;
    const plain = JSON.stringify(secretPart);
    try {
      const row = await this.prisma.integrationCredential.create({
        data: {
          provider,
          version,
          slot,
          label,
          priority,
          enabled: latestInSlot?.enabled ?? true,
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
      // A newer pending version replaces an older untested one of the set.
      await this.prisma.integrationCredential.updateMany({
        where: {
          provider,
          slot,
          status: 'pending',
          version: { lt: version },
        },
        data: { status: 'retired', retired_at: new Date() },
      });
      if (label !== (latestInSlot?.label ?? null)) {
        await this.prisma.integrationCredential.updateMany({
          where: { provider, slot },
          data: { label },
        });
      }
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
    const def = await this.def(provider);
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
    if (ok) this.cooldown.delete(`${provider}|${row.fingerprint}`);
    return this.summary(updated);
  }

  /** Makes [version] live in its key set; the set's previous active one
   * is kept (retired). Other sets are not touched. */
  async activate(provider: string, version: number, force = false) {
    this.needEnvelope();
    const def = await this.def(provider);
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
        where: { provider, slot: row.slot, status: 'active' },
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

  /** Back to the version of [slot] that was active before the current one. */
  async rollback(provider: string, slot = MAIN_SLOT) {
    this.needEnvelope();
    await this.def(provider);
    const current = await this.prisma.integrationCredential.findFirst({
      where: { provider, slot, status: 'active' },
    });
    const previous = await this.prisma.integrationCredential.findFirst({
      where: {
        provider,
        slot,
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

  /** Stops using the DB keys of [provider] — one key set, or all of them
   * (then back to env or "not set"). */
  async remove(provider: string, slot?: string): Promise<void> {
    this.needEnvelope();
    await this.def(provider);
    await this.prisma.integrationCredential.updateMany({
      where: {
        provider,
        ...(slot ? { slot } : {}),
        status: { in: ['active', 'pending'] },
      },
      data: { status: 'retired', retired_at: new Date() },
    });
    await this.changed(provider);
  }

  /** Name, on/off switch or place of a key set. */
  async updateSlot(provider: string, slot: string, patch: SlotPatch) {
    await this.def(provider);
    const n = await this.prisma.integrationCredential.count({
      where: { provider, slot },
    });
    if (n === 0) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'No such key set.',
      });
    }
    await this.prisma.integrationCredential.updateMany({
      where: { provider, slot },
      data: {
        ...(patch.label !== undefined
          ? { label: patch.label?.trim().slice(0, 60) || null }
          : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
      },
    });
    await this.changed(provider);
  }

  /** The order to try the key sets in: [slots] first to last. */
  async reorder(provider: string, slots: string[]) {
    await this.def(provider);
    await withTxRetry(this.prisma, async (tx) => {
      for (const [i, slot] of slots.entries()) {
        await tx.integrationCredential.updateMany({
          where: { provider, slot },
          data: { priority: i },
        });
      }
    });
    await this.changed(provider);
  }

  /** A service added from the admin: its id is custom_<name>. */
  async createCustom(
    input: {
      id: string;
      label: string;
      description?: string;
      fields: CustomFieldInput[];
    },
    adminId: string | null,
  ) {
    const id = input.id.startsWith(CUSTOM_PREFIX)
      ? input.id
      : `${CUSTOM_PREFIX}${input.id}`;
    if (!/^custom_[a-z0-9_]{2,40}$/.test(id) || providerById(id)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Service id: latin letters, digits and _ (2–40).',
        details: { field: 'id' },
      });
    }
    const names = new Set<string>();
    for (const f of input.fields) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(f.name) || names.has(f.name)) {
        throw new BadRequestException({
          code: ErrorCode.VALIDATION_ERROR,
          message: `Field "${f.name}": latin letters, digits and _, unique.`,
          details: { field: 'fields' },
        });
      }
      names.add(f.name);
    }
    const fields = input.fields.map((f) => ({
      name: f.name,
      label: f.label.trim().slice(0, 60) || f.name,
      secret: f.secret,
      required: f.required,
    }));
    try {
      await this.prisma.integrationCustomProvider.create({
        data: {
          id,
          label: input.label.trim().slice(0, 60),
          description: (input.description ?? '').trim().slice(0, 300),
          fields,
          created_by: adminId,
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: ErrorCode.INTEGRATION_CONFLICT,
          message: 'A service with this id already exists.',
        });
      }
      throw e;
    }
    await this.changed(CUSTOM_CHANNEL_KEY);
    return id;
  }

  /** Removes a service added from the admin; its keys stop being used. */
  async deleteCustom(id: string): Promise<void> {
    if (!id.startsWith(CUSTOM_PREFIX)) {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Built-in services cannot be deleted.',
      });
    }
    const r = await this.prisma.integrationCustomProvider.deleteMany({
      where: { id },
    });
    if (r.count === 0) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Unknown integration.',
      });
    }
    await this.prisma.integrationCredential.updateMany({
      where: { provider: id, status: { in: ['active', 'pending'] } },
      data: { status: 'retired', retired_at: new Date() },
    });
    await this.changed(CUSTOM_CHANNEL_KEY);
    await this.changed(id);
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

  /**
   * Owner 2026-10-06: the full saved values of one version, for the owner's
   * «показать» eye (super_admin + fresh 2FA/password, audited by the
   * caller). Only the fields of the definition; never cached or logged.
   */
  async reveal(
    provider: string,
    version: number,
  ): Promise<Record<string, string>> {
    this.needEnvelope();
    const def = await this.def(provider);
    const fields = this.fieldsOf(await this.row(provider, version));
    const out: Record<string, string> = {};
    for (const f of def.fields) {
      if (fields[f.name] !== undefined) out[f.name] = fields[f.name];
    }
    return out;
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

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Key set names that have an active or pending version. */
function slotsOf(rows: IntegrationCredential[]): string[] {
  return [...new Set(rows.map((r) => r.slot))];
}

function customDefinition(r: {
  id: string;
  label: string;
  description: string;
  fields: unknown;
}): ProviderDefinition {
  const fields = Array.isArray(r.fields)
    ? (r.fields as Partial<CustomFieldInput>[])
    : [];
  return {
    id: r.id,
    label: r.label,
    description: r.description,
    fields: fields
      .filter((f) => typeof f.name === 'string')
      .map((f) => ({
        name: f.name!,
        label: f.label ?? f.name!,
        secret: f.secret !== false,
        required: f.required === true,
      })),
  };
}

import { stateBarLookupUrl } from '../state-bar-links';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, StateBarRegistry } from '@prisma/client';
import { barRegistryAad } from '../../../common/secrets/aad';
import { readKey } from '../../../common/secrets/key-holder';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import {
  maskSecret,
  SecretEnvelope,
} from '../../../common/secrets/secret-envelope';
import { PrismaService } from '../../../prisma/prisma.service';
import type {
  BarLookupInput,
  CheckOutcome,
} from '../providers/verification-providers';
import { assertRegistryUrl } from '../providers/bar-lookup/registry-http';
import { RegistryGuard } from '../providers/bar-lookup/registry-guard';
import {
  adapterDescriptor,
  DEFAULT_RATE_PER_MIN,
  fillTemplate,
  GUARDED_ADAPTERS,
  NO_BULK_RECHECK,
  REGISTRY_ADAPTERS,
  STATE_BAR_ADAPTERS,
  type RegistryAdapterType,
  type ResolvedRegistry,
  type StateBarAdapter,
} from '../providers/bar-lookup/state-bar-adapter';
import { ratePerMinute } from '../providers/bar-lookup/state-preset.adapter';
import {
  freeDefaultAdapter,
  presetAllowed,
  PRESET_TERMS_BAN,
  registrySupport,
  STATE_PRESETS,
} from '../providers/bar-lookup/state-presets';
import {
  PAID_BAR_VENDORS,
  PaidBarVendorService,
} from '../providers/bar-lookup/paid-bar-vendors';

/** Runtime settings are re-read at most this often per process. */
const CACHE_MS = 30_000;
const CONFIG_VALUE_MAX = 500;
const SECRET_MAX = 4000;

export interface SaveRegistryInput {
  adapter: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  /** A new key; empty/absent keeps the saved one. */
  secret?: string;
  clearSecret?: boolean;
  testBarNumber?: string;
}

export interface RegistryTestResult {
  result: CheckOutcome['result'] | 'error';
  details: Record<string, unknown>;
  error: string | null;
  testedAt: string;
}

const aad = barRegistryAad;

function bad(message: string, field?: string): BadRequestException {
  return new BadRequestException({
    code: ErrorCode.VALIDATION_ERROR,
    message,
    ...(field && { details: { field } }),
  });
}

/**
 * Owner 2026-10-05 ("добавляю API ключи по штатам — приложение начинает
 * проверку"): the per-state registry settings of Admin → Ключи и сервисы
 * → "Реестры адвокатов по штатам". A state is checked automatically when
 * its row is enabled with an adapter other than `manual`; nothing else
 * (no feature flag, no release) is needed. Keys are AES-256-GCM envelopes
 * under the same master key as the integration keys and never leave the
 * server; the admin sees only "••••abcd".
 */
@Injectable()
export class StateRegistryService {
  private readonly envelope: SecretEnvelope | null;
  private readonly allowLocal: boolean;
  /** Owner 2026-11-12: free sources ON for a state with nothing saved.
   * BAR_REGISTRY_FREE_DEFAULTS=off turns it off; tests (NODE_ENV=test)
   * start with it off so CI never asks a live registry. */
  private readonly freeDefaults: boolean;
  private cache: { at: number; rows: Map<string, StateBarRegistry> } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(STATE_BAR_ADAPTERS)
    private readonly adapters: readonly StateBarAdapter[],
    private readonly guard: RegistryGuard = new RegistryGuard(),
    @Optional() private readonly vendors?: PaidBarVendorService,
  ) {
    const keys = readKey('SECRETS_MASTER_KEYS', () =>
      config.get<string>('SECRETS_MASTER_KEYS'),
    );
    const kid = config.get<string>('SECRETS_ACTIVE_KID');
    this.envelope = keys && kid ? new SecretEnvelope(keys, kid) : null;
    this.allowLocal = config.get<string>('NODE_ENV') !== 'production';
    const defaults = config.get<string>('BAR_REGISTRY_FREE_DEFAULTS');
    this.freeDefaults = defaults
      ? defaults !== 'off'
      : (config.get<string>('NODE_ENV') ?? process.env.NODE_ENV) !== 'test';
  }

  get secretsEnabled(): boolean {
    return this.envelope !== null;
  }

  // --- runtime ---------------------------------------------------------------

  /**
   * The automatic registry of [stateCode], or null (manual): the admin's
   * saved row when it is on; with nothing saved, the free default (owner
   * 2026-11-12: free sources ON); then a paid service the owner switched
   * on (paid-bar-vendors.ts, all OFF by default).
   */
  async resolve(stateCode: string): Promise<ResolvedRegistry | null> {
    const own = await this.freeRegistry(stateCode);
    if (own) return own;
    return (await this.vendors?.resolve(stateCode).catch(() => null)) ?? null;
  }

  /** The state's own (free or keyed) registry, without paid services. */
  private async freeRegistry(
    stateCode: string,
  ): Promise<ResolvedRegistry | null> {
    const row = (await this.rows()).get(stateCode);
    if (row) return this.isOn(row) ? this.resolved(row) : null;
    return this.defaultRegistry(stateCode);
  }

  /** A saved row asks its registry (never a state whose terms forbid it). */
  private isOn(row: StateBarRegistry): boolean {
    if (!row.enabled || row.adapter === 'manual') return false;
    return !(
      row.adapter === 'state_preset' && PRESET_TERMS_BAN[row.state_code]
    );
  }

  /** The free default of a state with nothing saved, or null. */
  private defaultRegistry(stateCode: string): ResolvedRegistry | null {
    if (!this.freeDefaults) return null;
    const adapter = freeDefaultAdapter(stateCode);
    return adapter ? { stateCode, adapter, config: {}, secret: null } : null;
  }

  /** States checked automatically right now. [bulk]: only those the
   * monthly re-check may sweep (owner 2026-10-28: public web pages are
   * asked once per new license and on an admin's re-check, never in bulk). */
  async enabledStates(opts: { bulk?: boolean } = {}): Promise<string[]> {
    const rows = await this.rows();
    const on: { code: string; adapter: RegistryAdapterType }[] = [
      ...rows.values(),
    ]
      .filter((r) => this.isOn(r))
      .map((r) => ({
        code: r.state_code,
        adapter: r.adapter as RegistryAdapterType,
      }));
    // Owner 2026-11-12: the free defaults of states with nothing saved.
    // Paid services are never swept in bulk (each lookup costs money).
    const states = !this.freeDefaults
      ? []
      : await this.prisma.state
          .findMany({ where: { is_active: true }, select: { code: true } })
          .catch(() => [] as { code: string }[]);
    for (const { code } of states) {
      if (rows.has(code)) continue;
      const d = this.defaultRegistry(code);
      if (d) on.push({ code, adapter: d.adapter });
    }
    return on
      .filter((r) => !opts.bulk || !NO_BULK_RECHECK.has(r.adapter))
      .map((r) => r.code)
      .sort();
  }

  /**
   * One lookup with [registry]'s adapter. Errors propagate. Web pages and
   * third-party APIs go through the per-state guard (owner 2026-10-28:
   * 24 h cache, rate limit, circuit breaker); [fresh] (the admin's
   * «Проверить») skips the cache and an open breaker.
   */
  lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
    opts: { fresh?: boolean } = {},
  ): Promise<CheckOutcome> {
    const adapter = this.adapters.find((a) => a.type === registry.adapter);
    if (!adapter) {
      return Promise.reject(
        new Error(`No adapter of type ${registry.adapter}`),
      );
    }
    if (!GUARDED_ADAPTERS.has(registry.adapter)) {
      return adapter.lookup(input, registry);
    }
    return this.guard.run(
      registry.stateCode,
      RegistryGuard.key(registry.stateCode, registry.adapter, input),
      {
        ratePerMin: ratePerMinute(registry, DEFAULT_RATE_PER_MIN),
        fresh: opts.fresh,
      },
      () => adapter.lookup(input, registry),
    );
  }

  invalidate(): void {
    this.cache = null;
  }

  private async rows(): Promise<Map<string, StateBarRegistry>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) {
      return this.cache.rows;
    }
    const rows = await this.prisma.stateBarRegistry.findMany();
    this.cache = {
      at: Date.now(),
      rows: new Map(rows.map((r) => [r.state_code, r])),
    };
    return this.cache.rows;
  }

  private resolved(row: StateBarRegistry): ResolvedRegistry {
    let secret: string | null = null;
    if (row.secret_enc && this.envelope) {
      secret = this.envelope.decrypt(row.secret_enc, aad(row.state_code));
    }
    return {
      stateCode: row.state_code,
      adapter: row.adapter as RegistryAdapterType,
      config: stringConfig(row.config),
      secret,
    };
  }

  // --- admin -----------------------------------------------------------------

  /** Every active state (50 + DC) with its settings — never a key. */
  async list() {
    const [states, rows, misses] = await Promise.all([
      this.prisma.state.findMany({
        where: { is_active: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.stateBarRegistry.findMany(),
      this.prisma.barFormatMiss.findMany({
        orderBy: [{ hits: 'desc' }, { last_seen: 'desc' }],
        take: 200,
      }),
    ]);
    const byState = new Map(rows.map((r) => [r.state_code, r]));
    return {
      secretsEnabled: this.secretsEnabled,
      adapterTypes: REGISTRY_ADAPTERS,
      // Owner 2026-11-12: paid services (switch in «Настройки», key in
      // «Ключи и сервисы»), all OFF by default.
      paidVendors: PAID_BAR_VENDORS.map((v) => ({
        id: v.id,
        label: v.label,
        settingKey: v.settingKey,
        states: v.states,
        price: v.priceText,
        signupUrl: v.signupUrl,
      })),
      items: states.map((s) => this.dto(s.code, s.name, byState.get(s.code))),
      formatMisses: misses.map((m) => ({
        stateCode: m.state_code,
        shape: m.shape,
        hits: m.hits,
        lastSeen: m.last_seen.toISOString(),
      })),
    };
  }

  async save(stateCode: string, input: SaveRegistryInput, adminId: string) {
    const state = await this.stateOr404(stateCode);
    const current = await this.prisma.stateBarRegistry.findUnique({
      where: { state_code: state.code },
    });
    const desc = adapterDescriptor(input.adapter);
    if (!desc) throw bad('Unknown adapter type.', 'adapter');

    const config: Record<string, string> = {};
    for (const f of desc.fields) {
      const raw = input.config?.[f.name];
      const v = typeof raw === 'string' ? raw.trim() : '';
      if (v.length > CONFIG_VALUE_MAX)
        throw bad(`${f.label} is too long.`, f.name);
      if (f.options && v && !f.options.includes(v)) {
        throw bad(`${f.label}: one of ${f.options.join(', ')}.`, f.name);
      }
      if (v) config[f.name] = v;
    }

    let secretEnc = current?.secret_enc ?? null;
    let secretMasked = current?.secret_masked ?? null;
    if (input.clearSecret) {
      secretEnc = null;
      secretMasked = null;
    }
    const newSecret = (input.secret ?? '').trim();
    if (newSecret && desc.secret !== 'none') {
      if (newSecret.length > SECRET_MAX)
        throw bad('The key is too long.', 'secret');
      secretEnc = this.needEnvelope().encrypt(newSecret, aad(state.code));
      secretMasked = maskSecret(newSecret);
    }
    if (desc.secret === 'none') {
      secretEnc = null;
      secretMasked = null;
    }

    if (input.enabled && desc.type !== 'manual') {
      for (const f of desc.fields) {
        if (f.required && !config[f.name])
          throw bad(`${f.label} is required.`, f.name);
      }
      this.validateUrls(desc.type, config);
      if (
        desc.type === 'generic_rest' &&
        (config.authType ?? 'none') !== 'none' &&
        !secretEnc
      ) {
        throw bad('Enter the API key.', 'secret');
      }
      if (desc.type === 'state_preset' && !STATE_PRESETS[state.code]) {
        throw bad(
          `${state.name} has no ready-made registry: its site cannot be checked automatically.`,
          'adapter',
        );
      }
      if (desc.type === 'state_preset' && PRESET_TERMS_BAN[state.code]) {
        throw bad(
          `${state.name}: the registry's terms forbid automated access, so it stays on the manual lookup link.`,
          'adapter',
        );
      }
      if (
        desc.type === 'html_page' &&
        !config.nameSelector &&
        !config.lastNameSelector
      ) {
        throw bad('Set the name selector.', 'nameSelector');
      }
      if (
        desc.type === 'generic_rest' &&
        !config.lastNamePath &&
        !config.fullNamePath
      ) {
        throw bad(
          'Set the last name path or the full name path.',
          'lastNamePath',
        );
      }
    }

    const testBarNumber =
      (input.testBarNumber ?? '').trim().slice(0, 40) || null;
    const data = {
      adapter: desc.type,
      enabled: input.enabled && desc.type !== 'manual',
      config: config as Prisma.InputJsonObject,
      secret_enc: secretEnc,
      secret_masked: secretMasked,
      test_bar_number: testBarNumber ?? current?.test_bar_number ?? null,
      updated_by: adminId,
    };
    const row = await this.prisma.stateBarRegistry.upsert({
      where: { state_code: state.code },
      create: { state_code: state.code, ...data },
      update: data,
    });
    this.invalidate();
    this.guard.reset(state.code);
    return this.dto(state.code, state.name, row);
  }

  /** Copies [from]'s adapter, settings and key to [to] (one vendor key for
   * many states). */
  async copy(from: string, to: string[], adminId: string) {
    const src = await this.prisma.stateBarRegistry.findUnique({
      where: { state_code: from.toUpperCase() },
    });
    if (!src) throw bad('Save the source state first.', 'from');
    const plain =
      src.secret_enc && this.envelope
        ? this.envelope.decrypt(src.secret_enc, aad(src.state_code))
        : null;
    const codes = [...new Set(to.map((c) => c.toUpperCase()))].filter(
      (c) =>
        c !== src.state_code &&
        // Owner 2026-10-28: a ready-made preset exists only for some states.
        (src.adapter !== 'state_preset' || presetAllowed(c)),
    );
    const targets = await this.prisma.state.findMany({
      where: { code: { in: codes } },
      orderBy: { code: 'asc' },
    });
    for (const t of targets) {
      const data = {
        adapter: src.adapter,
        enabled: src.enabled,
        config: src.config as Prisma.InputJsonObject,
        secret_enc:
          plain !== null
            ? this.needEnvelope().encrypt(plain, aad(t.code))
            : null,
        secret_masked: src.secret_masked,
        updated_by: adminId,
      };
      await this.prisma.stateBarRegistry.upsert({
        where: { state_code: t.code },
        create: { state_code: t.code, ...data },
        update: data,
      });
    }
    this.invalidate();
    return { copied: targets.map((t) => t.code) };
  }

  /** "Проверить": one lookup with the saved settings (enabled or not). */
  async test(
    stateCode: string,
    input: { barNumber: string; firstName?: string; lastName?: string },
  ): Promise<RegistryTestResult> {
    const state = await this.stateOr404(stateCode);
    const row = await this.prisma.stateBarRegistry.findUnique({
      where: { state_code: state.code },
    });
    // Owner 2026-11-12: a state on its free default can be tested too.
    const registry =
      row && row.adapter !== 'manual'
        ? this.resolved(row)
        : !row
          ? this.defaultRegistry(state.code)
          : null;
    if (!registry) {
      throw bad('Pick an automatic adapter and save first.', 'adapter');
    }
    const testedAt = new Date();
    let out: RegistryTestResult;
    try {
      const outcome = await this.lookup(
        {
          stateCode: state.code,
          barNumber: input.barNumber,
          firstName: input.firstName ?? '',
          lastName: input.lastName ?? '',
        },
        registry,
        { fresh: true },
      );
      out = {
        result: outcome.result,
        details: outcome.details,
        error: null,
        testedAt: testedAt.toISOString(),
      };
    } catch (e) {
      out = {
        result: 'error',
        details: {},
        error: (e instanceof Error ? e.message : String(e)).slice(0, 300),
        testedAt: testedAt.toISOString(),
      };
    }
    const testData = {
      last_test_at: testedAt,
      last_test_result: JSON.parse(
        JSON.stringify(out),
      ) as Prisma.InputJsonObject,
      test_bar_number: input.barNumber.trim().slice(0, 40),
    };
    if (row) {
      await this.prisma.stateBarRegistry.update({
        where: { state_code: state.code },
        data: testData,
      });
    }
    return out;
  }

  private validateUrls(type: RegistryAdapterType, c: Record<string, string>) {
    const sample = {
      stateCode: 'NY',
      barNumber: '1',
      firstName: 'A',
      lastName: 'B',
    };
    if (c.ratePerMin) {
      const n = Number(c.ratePerMin);
      if (!Number.isInteger(n) || n < 1 || n > 60) {
        throw bad(
          'Requests per minute: a whole number from 1 to 60.',
          'ratePerMin',
        );
      }
    }
    if (c.headers) {
      try {
        const h: unknown = JSON.parse(c.headers);
        if (!h || typeof h !== 'object' || Array.isArray(h)) throw new Error();
      } catch {
        throw bad('Extra headers must be a JSON object.', 'headers');
      }
    }
    try {
      if ((type === 'generic_rest' || type === 'html_page') && c.urlTemplate) {
        assertRegistryUrl(fillTemplate(c.urlTemplate, sample), this.allowLocal);
      }
      for (const f of ['bootstrapUrl', 'referer'] as const) {
        if (c[f]) {
          assertRegistryUrl(fillTemplate(c[f], sample), this.allowLocal);
        }
      }
      if (type === 'socrata' && c.domain) {
        assertRegistryUrl(`https://${c.domain}/`, this.allowLocal);
      }
      if (c.profileUrl) {
        assertRegistryUrl(fillTemplate(c.profileUrl, sample), this.allowLocal);
      }
    } catch (e) {
      throw bad((e as Error).message, 'urlTemplate');
    }
  }

  private async stateOr404(code: string) {
    const state = await this.prisma.state.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (!state) {
      throw new NotFoundException({
        code: ErrorCode.NOT_FOUND,
        message: 'Unknown state.',
      });
    }
    return state;
  }

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

  private dto(code: string, name: string, row?: StateBarRegistry) {
    const fallback = row ? null : this.defaultRegistry(code);
    return {
      stateCode: code,
      stateName: name,
      adapter: (row?.adapter ??
        fallback?.adapter ??
        'manual') as RegistryAdapterType,
      enabled: row ? this.isOn(row) : fallback !== null,
      /** Owner 2026-11-12: on by default, nothing saved for the state. */
      isDefault: !row && fallback !== null,
      config: row ? stringConfig(row.config) : {},
      hasSecret: !!row?.secret_enc,
      secretMasked: row?.secret_masked ?? null,
      testBarNumber: row?.test_bar_number ?? null,
      lastTestAt: row?.last_test_at?.toISOString() ?? null,
      lastTestResult:
        (row?.last_test_result as Record<string, unknown> | null) ?? null,
      updatedAt: row?.updated_at.toISOString() ?? null,
      lookupUrl: stateBarLookupUrl(code, ''),
      ...supportDto(code),
      pausedUntil: this.guard.status(code).pausedUntil,
    };
  }
}

function stringConfig(raw: Prisma.JsonValue): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

/** Owner 2026-10-28: can the state be checked automatically, and why not. */
function supportDto(code: string): {
  support: 'automatic' | 'manual';
  supportNote: string;
  presetAvailable: boolean;
} {
  const s = registrySupport(code);
  return s.mode === 'automatic'
    ? {
        support: 'automatic',
        supportNote: s.note,
        presetAvailable: s.adapter === 'state_preset',
      }
    : { support: 'manual', supportNote: s.reason, presetAvailable: false };
}

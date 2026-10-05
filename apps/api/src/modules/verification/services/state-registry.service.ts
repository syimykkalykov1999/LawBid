import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma, StateBarRegistry } from '@prisma/client';
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
import {
  adapterDescriptor,
  fillTemplate,
  REGISTRY_ADAPTERS,
  STATE_BAR_ADAPTERS,
  type RegistryAdapterType,
  type ResolvedRegistry,
  type StateBarAdapter,
} from '../providers/bar-lookup/state-bar-adapter';

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

const aad = (stateCode: string) => `bar_registry:${stateCode}`;

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
  private cache: { at: number; rows: Map<string, StateBarRegistry> } | null =
    null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
    @Inject(STATE_BAR_ADAPTERS)
    private readonly adapters: readonly StateBarAdapter[],
  ) {
    const keys = config.get<string>('SECRETS_MASTER_KEYS');
    const kid = config.get<string>('SECRETS_ACTIVE_KID');
    this.envelope = keys && kid ? new SecretEnvelope(keys, kid) : null;
    this.allowLocal = config.get<string>('NODE_ENV') !== 'production';
  }

  get secretsEnabled(): boolean {
    return this.envelope !== null;
  }

  // --- runtime ---------------------------------------------------------------

  /** The enabled automatic registry of [stateCode], or null (manual). */
  async resolve(stateCode: string): Promise<ResolvedRegistry | null> {
    const row = (await this.rows()).get(stateCode);
    if (!row || !row.enabled || row.adapter === 'manual') return null;
    return this.resolved(row);
  }

  /** States checked automatically right now. */
  async enabledStates(): Promise<string[]> {
    return [...(await this.rows()).values()]
      .filter((r) => r.enabled && r.adapter !== 'manual')
      .map((r) => r.state_code);
  }

  /** One lookup with [registry]'s adapter. Errors propagate. */
  lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
  ): Promise<CheckOutcome> {
    const adapter = this.adapters.find((a) => a.type === registry.adapter);
    if (!adapter) {
      return Promise.reject(
        new Error(`No adapter of type ${registry.adapter}`),
      );
    }
    return adapter.lookup(input, registry);
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
    const [states, rows] = await Promise.all([
      this.prisma.state.findMany({
        where: { is_active: true },
        orderBy: { code: 'asc' },
      }),
      this.prisma.stateBarRegistry.findMany(),
    ]);
    const byState = new Map(rows.map((r) => [r.state_code, r]));
    return {
      secretsEnabled: this.secretsEnabled,
      adapterTypes: REGISTRY_ADAPTERS,
      items: states.map((s) => this.dto(s.code, s.name, byState.get(s.code))),
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
      (c) => c !== src.state_code,
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
    if (!row || row.adapter === 'manual') {
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
        this.resolved(row),
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
    await this.prisma.stateBarRegistry.update({
      where: { state_code: state.code },
      data: {
        last_test_at: testedAt,
        last_test_result: JSON.parse(
          JSON.stringify(out),
        ) as Prisma.InputJsonObject,
        test_bar_number: input.barNumber.trim().slice(0, 40),
      },
    });
    return out;
  }

  private validateUrls(type: RegistryAdapterType, c: Record<string, string>) {
    const sample = {
      stateCode: 'NY',
      barNumber: '1',
      firstName: 'A',
      lastName: 'B',
    };
    try {
      if (type === 'generic_rest' && c.urlTemplate) {
        assertRegistryUrl(fillTemplate(c.urlTemplate, sample), this.allowLocal);
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
    return {
      stateCode: code,
      stateName: name,
      adapter: (row?.adapter ?? 'manual') as RegistryAdapterType,
      enabled: row?.enabled ?? false,
      config: row ? stringConfig(row.config) : {},
      hasSecret: !!row?.secret_enc,
      secretMasked: row?.secret_masked ?? null,
      testBarNumber: row?.test_bar_number ?? null,
      lastTestAt: row?.last_test_at?.toISOString() ?? null,
      lastTestResult:
        (row?.last_test_result as Record<string, unknown> | null) ?? null,
      updatedAt: row?.updated_at.toISOString() ?? null,
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

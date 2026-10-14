import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type Audience,
  CATALOG_BY_KEY,
  customEntitlementDefs,
  type EntitlementDef,
  setCustomEntitlementDefs,
} from './entitlement-catalog';

export const CUSTOM_ENTITLEMENTS_KEY = 'plans.custom_entitlements';
const REFRESH_MS = 10_000;
export const CUSTOM_KEY_PATTERN = /^[a-z][a-z0-9_]{2,39}$/;
const GROUPS = ['team', 'cases', 'visibility', 'features', 'billing'] as const;

export interface NewEntitlementInput {
  key: string;
  type: 'boolean' | 'number';
  audiences: Audience[];
  group: EntitlementDef['group'];
  label: { en: string; ru: string };
  description: { en: string; ru: string };
  min?: number;
  max?: number;
  zeroIsUnlimited?: boolean;
}

/**
 * Owner 2026-10-14: the features a plan can include are data. This keeps
 * the owner-created ones (admin: Деньги → Планы → «Новая функция») in one
 * app_config row and mirrors them into the catalog every instance uses;
 * a short refresh interval makes another instance's change visible without
 * a restart. Built-in keys can never be redefined or removed.
 */
@Injectable()
export class CustomEntitlementsService implements OnModuleInit {
  private readonly logger = new Logger(CustomEntitlementsService.name);
  private loadedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.refresh().catch((e) =>
      this.logger.warn(`custom features not loaded: ${String(e)}`),
    );
  }

  /** Cheap: reads the row at most every few seconds. */
  async ensureFresh(): Promise<void> {
    if (Date.now() - this.loadedAt < REFRESH_MS) return;
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const row = await this.prisma.appConfig.findUnique({
      where: { key: CUSTOM_ENTITLEMENTS_KEY },
    });
    setCustomEntitlementDefs(parseDefs(row?.value));
    this.loadedAt = Date.now();
  }

  list(): readonly EntitlementDef[] {
    return customEntitlementDefs();
  }

  async create(input: NewEntitlementInput): Promise<EntitlementDef> {
    await this.refresh();
    if (!CUSTOM_KEY_PATTERN.test(input.key)) {
      throw new Error('bad_key');
    }
    if (
      CATALOG_BY_KEY.has(input.key) ||
      customEntitlementDefs().some((d) => d.key === input.key)
    ) {
      throw new Error('key_exists');
    }
    const def: EntitlementDef = {
      key: input.key,
      type: input.type,
      audiences: input.audiences,
      group: input.group,
      label: input.label,
      description: input.description,
      ...(input.type === 'number'
        ? {
            min: input.min ?? 0,
            max: input.max ?? 1_000_000,
            zeroIsUnlimited: input.zeroIsUnlimited ?? false,
          }
        : {}),
      custom: true,
    };
    await this.save([...customEntitlementDefs(), def]);
    return def;
  }

  async remove(key: string): Promise<boolean> {
    await this.refresh();
    const left = customEntitlementDefs().filter((d) => d.key !== key);
    if (left.length === customEntitlementDefs().length) return false;
    await this.save(left);
    return true;
  }

  private async save(defs: readonly EntitlementDef[]): Promise<void> {
    const value = JSON.parse(JSON.stringify(defs)) as object;
    await this.prisma.appConfig.upsert({
      where: { key: CUSTOM_ENTITLEMENTS_KEY },
      create: { key: CUSTOM_ENTITLEMENTS_KEY, value },
      update: { value },
    });
    setCustomEntitlementDefs(defs);
    this.loadedAt = Date.now();
  }
}

/** Defensive: a malformed row yields no custom features, never a crash. */
export function parseDefs(raw: unknown): EntitlementDef[] {
  if (!Array.isArray(raw)) return [];
  const out: EntitlementDef[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    if (!r || typeof r.key !== 'string' || !CUSTOM_KEY_PATTERN.test(r.key))
      continue;
    if (r.type !== 'boolean' && r.type !== 'number') continue;
    const audiences = (Array.isArray(r.audiences) ? r.audiences : []).filter(
      (a): a is Audience => a === 'attorney' || a === 'client',
    );
    if (audiences.length === 0) continue;
    const label = r.label as { en?: string; ru?: string } | undefined;
    const description = r.description as
      { en?: string; ru?: string } | undefined;
    out.push({
      key: r.key,
      type: r.type,
      audiences,
      group: (GROUPS as readonly string[]).includes(String(r.group))
        ? (r.group as EntitlementDef['group'])
        : 'features',
      label: { en: label?.en ?? r.key, ru: label?.ru ?? label?.en ?? r.key },
      description: {
        en: description?.en ?? '',
        ru: description?.ru ?? description?.en ?? '',
      },
      ...(r.type === 'number'
        ? {
            min: typeof r.min === 'number' ? r.min : 0,
            max: typeof r.max === 'number' ? r.max : 1_000_000,
            zeroIsUnlimited: r.zeroIsUnlimited === true,
          }
        : {}),
      custom: true,
    });
  }
  return out;
}

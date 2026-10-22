import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE = 20_000;

/** A built-in text for when the translations were not imported yet. */
export interface TextFallback {
  en: string;
  ru?: string;
}

/** `{name}` → vars.name (unknown placeholders stay as they are). */
export function fillVars(
  text: string,
  vars: Record<string, string | number> = {},
): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in vars ? String(vars[k]) : m,
  );
}

/**
 * Owner 2026-10-22 (audit #4 §4): server texts (pushes, auto replies) in
 * every app language. Reads the same i18n_translations the app's bundle is
 * built from (imported from prisma/seed/translations_seed.xlsx at deploy,
 * 85 languages, admin-editable), so a text translated for the app is the
 * text the server sends. Order: the person's language → its base language
 * (pt-BR → pt) → English in the table → the built-in fallback. Per-process
 * cache, 5 minutes: a push burst costs no extra reads.
 */
@Injectable()
export class ServerTextsService {
  private readonly cache = new Map<string, { v: string | null; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  async text(
    lang: string | null | undefined,
    key: string,
    fallback: TextFallback,
    vars?: Record<string, string | number>,
  ): Promise<string> {
    const l = (lang || 'en').trim();
    const base = l.split(/[-_]/)[0];
    const chain = [...new Set([l, base, 'en'])];
    for (const code of chain) {
      const v = await this.lookup(code, key);
      if (v) return fillVars(v, vars);
    }
    const own = base === 'ru' && fallback.ru ? fallback.ru : fallback.en;
    return fillVars(own, vars);
  }

  /** Several keys of one language at once (still one cached read each). */
  async texts<K extends string>(
    lang: string | null | undefined,
    keys: Record<K, [string, TextFallback]>,
  ): Promise<Record<K, string>> {
    const out = {} as Record<K, string>;
    await Promise.all(
      (Object.keys(keys) as K[]).map(async (k) => {
        const [key, fb] = keys[k];
        out[k] = await this.text(lang, key, fb);
      }),
    );
    return out;
  }

  async lookup(lang: string, key: string): Promise<string | null> {
    const cacheKey = `${lang}:${key}`;
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.v;
    const row = await this.prisma.i18nTranslation.findFirst({
      where: { lang, i18n_key: { key } },
      select: { value: true },
    });
    const v = row?.value?.trim() ? row.value : null;
    if (this.cache.size >= MAX_CACHE) this.cache.clear();
    this.cache.set(cacheKey, { v, at: Date.now() });
    return v;
  }
}

/** Global: pushes (API + worker) and support replies read it. */
@Global()
@Module({
  providers: [ServerTextsService],
  exports: [ServerTextsService],
})
export class ServerTextsModule {}

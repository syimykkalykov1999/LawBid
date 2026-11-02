import type { BarLookupInput, CheckOutcome } from '../verification-providers';
import { GenericRestAdapter } from './generic-rest.adapter';
import { HtmlPageAdapter } from './html-page.adapter';
import type { ResolvedRegistry, StateBarAdapter } from './state-bar-adapter';
import { STATE_PRESETS } from './state-presets';

/**
 * Owner 2026-10-28: «Готовый: официальный сайт штата» — the state's row
 * needs no settings; the ready-made preset of that state (state-presets.ts)
 * is run by the HTML-page or REST engine. Details carry `provider:
 * preset:<STATE>` so a verifier sees where the answer came from.
 */
export class StatePresetAdapter implements StateBarAdapter {
  readonly type = 'state_preset' as const;
  private readonly html: HtmlPageAdapter;
  private readonly rest: GenericRestAdapter;

  constructor(allowLocal = false, fetchImpl?: typeof fetch) {
    this.html = new HtmlPageAdapter(allowLocal, fetchImpl);
    this.rest = new GenericRestAdapter(allowLocal, fetchImpl);
  }

  lookup(
    input: BarLookupInput,
    registry: ResolvedRegistry,
  ): Promise<CheckOutcome> {
    const preset = STATE_PRESETS[registry.stateCode];
    if (!preset) {
      return Promise.reject(
        new Error(`No ready-made registry settings for ${registry.stateCode}`),
      );
    }
    const resolved: ResolvedRegistry = {
      ...registry,
      adapter: preset.engine,
      config: { ...preset.config },
      secret: null,
    };
    const provider = `preset:${registry.stateCode}`;
    return preset.engine === 'html_page'
      ? this.html.lookup(input, resolved, provider)
      : this.rest.lookup(input, resolved, provider);
  }
}

/** Requests a minute for [registry]: the admin's value, else the preset's,
 * else the default. */
export function ratePerMinute(
  registry: ResolvedRegistry,
  fallback: number,
): number {
  const own = Number(registry.config.ratePerMin);
  if (Number.isFinite(own) && own > 0) return Math.min(own, 60);
  const preset =
    registry.adapter === 'state_preset'
      ? Number(STATE_PRESETS[registry.stateCode]?.config.ratePerMin)
      : NaN;
  if (Number.isFinite(preset) && preset > 0) return preset;
  return fallback;
}

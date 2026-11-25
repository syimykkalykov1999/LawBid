import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { Logger } from '@nestjs/common';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import {
  APP_SETTINGS,
  type AppSettingKey,
} from '../../../common/app-settings/app-settings.defaults';
import { assignVariant } from '../../experiments/experiment-math';
import type { Assignment } from '../../experiments/experiments.service';
import { type FeatureSpec, toMatrixBy } from './feature-spec';

/**
 * F2 (docs/dev/ARCHITECTURE_VS_BIG_PLATFORMS_2026-11-25.md §6 item 24) and
 * owner 25.11 («умную ленту для всех лент»): the second, learned stage of
 * a feed's ranking. The feed's formula still picks and orders the
 * candidates; for the people in the model arm of that feed's test the best
 * `<prefix>.top_n` of them are re-ordered by a LightGBM LambdaMART model
 * (ml/feed-ranker/train.py --feed …), run here through ONNX Runtime. One
 * instance per feed (PostRankerService, ReelRankerService,
 * CaseRankerService): its own settings, feature spec, test key and model.
 *
 * Runtime: onnxruntime-web (MIT, Microsoft's ONNX Runtime built to
 * WebAssembly). Its native twin onnxruntime-node does not load on the
 * API image (node:alpine, musl: "Error loading shared library
 * ld-linux-aarch64.so.1", checked 25.11 with docker run); the WebAssembly
 * build runs on every image and scores 400 candidates in ~0.1 ms.
 *
 * Admin (per feed, `<prefix>.*`):
 *  - `mode`: off (the formula for everyone) | on (the test runs whenever a
 *    model is loaded) | auto (default: only while the loaded model beat
 *    the formula offline — manifest NDCG — and its scoring stays inside
 *    `latency_budget_ms`). No model = the formula, in every mode;
 *  - `traffic_percent`: share of people in the test, of whom
 *    `model_share_percent` get the model and the rest are the control arm
 *    (the formula, tagged, for a fair comparison);
 *  - `model_key`: S3 key of model.onnx in the documents bucket
 *    (manifest.json beside it); empty = no model = the formula.
 *
 * Assignment is the experiments' own: assignVariant with GrowthBook hash
 * v2 under the feed's key — deterministic, ramping the share keeps
 * everyone already inside. Nothing here ever throws into a request: any
 * failure (S3 down, a broken file, another feature list, a slow model)
 * means the formula.
 */
export const RANKER_MODEL_VARIANT = 'model';

export type RankerMode = 'off' | 'on' | 'auto';

export interface RankerFeed {
  /** posts | reels | cases (logs, admin status). */
  readonly feed: string;
  /** The A/B test key (ranking_events.experiment_key). */
  readonly experimentKey: string;
  /** Admin settings prefix: `<prefix>.mode`, `<prefix>.model_key`, … */
  readonly settingsPrefix: string;
  readonly spec: FeatureSpec;
  /** What a production model key of this feed looks like. */
  readonly modelKeyRe: RegExp;
}

export interface RankerManifest {
  version: string;
  feature_spec_version: string;
  features: string[];
  input_name?: string;
  sha256?: string;
  metrics?: { ndcg_formula?: number; ndcg_model?: number; k?: number };
}

/** Reads a model file from the documents bucket (production path). */
export type S3ModelReader = (key: string) => Promise<Buffer>;

/** Where model files come from (S3 in production; a test can swap it). */
export interface RankerModelSource {
  read(key: string): Promise<Buffer>;
}
export const RANKER_MODEL_SOURCE = Symbol('RANKER_MODEL_SOURCE');

/** The part of onnxruntime's InferenceSession used here. */
interface OrtSession {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(
    feeds: Record<string, unknown>,
  ): Promise<Record<string, { data: unknown }>>;
}
interface OrtModule {
  env: { wasm: { numThreads?: number }; logLevel?: string };
  InferenceSession: { create(model: Uint8Array): Promise<OrtSession> };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => unknown;
}

interface Loaded {
  key: string;
  manifest: RankerManifest;
  session: OrtSession;
  input: string;
  output: string;
}

interface Settings {
  at: number;
  mode: RankerMode;
  traffic: number;
  share: number;
  key: string;
  topN: number;
  budgetMs: number;
}

const SETTINGS_TTL_MS = 15_000;
/** A failed load is retried after this long (a broken upload never hammers S3). */
const RETRY_MS = 60_000;
/** Scoring times remembered for «Авто»'s latency check. */
const LATENCY_WINDOW = 200;
/** «Авто» sits out this long after its p95 went over the budget. */
const LATENCY_COOLDOWN_MS = 5 * 60_000;

let ortModule: Promise<OrtModule> | null = null;
/** onnxruntime-web, loaded on the first model (most pods never need it). */
function ort(): Promise<OrtModule> {
  ortModule ??= import('onnxruntime-web').then((m) => {
    const o = ((m as { default?: unknown }).default ?? m) as OrtModule;
    // One thread: a request scores ~100 rows; worker threads would cost
    // more than the work.
    o.env.wasm.numThreads = 1;
    o.env.logLevel = 'error';
    return o;
  });
  return ortModule;
}

/** p95 of [xs] (nearest rank). */
export function p95(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)];
}

/** Why a manifest cannot be used with [spec]'s features (null = fine). */
export function manifestProblemFor(
  spec: FeatureSpec,
  m: unknown,
): string | null {
  if (!m || typeof m !== 'object') return 'manifest is not an object';
  const o = m as Partial<RankerManifest>;
  if (typeof o.version !== 'string' || o.version.length === 0)
    return 'manifest has no version';
  if (o.feature_spec_version !== spec.version)
    return `feature spec ${String(o.feature_spec_version)} != ${spec.version}`;
  const want = spec.features;
  if (
    !Array.isArray(o.features) ||
    o.features.length !== want.length ||
    o.features.some((f, i) => f !== want[i])
  )
    return 'manifest features differ from the API feature list';
  return null;
}

/** True for the arm of [experimentKey]'s test that the model ranks. */
export function isModelArmOf(
  experimentKey: string,
  a: Assignment | null | undefined,
): boolean {
  return (
    a?.experimentKey === experimentKey && a.variant === RANKER_MODEL_VARIANT
  );
}

export abstract class LearnedRanker {
  private readonly log: Logger;
  private cfg: Settings | null = null;
  private loaded: Loaded | null = null;
  private loading: Promise<void> | null = null;
  private failed: { key: string; at: number; why: string } | null = null;
  private readonly latencies: number[] = [];
  private coolUntil = 0;

  protected constructor(
    readonly feed: RankerFeed,
    private readonly settings?: AppSettingsService,
    private readonly s3?: S3ModelReader,
    private readonly source?: RankerModelSource,
  ) {
    this.log = new Logger(`${feed.feed}-ranker`);
  }

  /** Re-reads the settings next time (tests, an admin save on this pod). */
  invalidate(): void {
    this.cfg = null;
  }

  /**
   * The viewer's arm of this feed's ranker test, or null = not in it (the
   * mode is off, no usable model yet, «Авто» not ready, or outside the
   * traffic share): the usual formula and the usual experiments. Never
   * waits for a model download: the first call starts it in the background.
   */
  async assign(viewerId: string): Promise<Assignment | null> {
    try {
      const s = await this.config();
      if (s.mode === 'off' || s.traffic <= 0 || !s.key) return null;
      const model = this.model(s.key);
      if (!model || !this.usable(s, model)) return null;
      const variant = assignVariant(
        viewerId,
        this.feed.experimentKey,
        [
          { key: 'control', weight: 100 - s.share },
          { key: RANKER_MODEL_VARIANT, weight: s.share },
        ],
        s.traffic,
        2,
      );
      return variant
        ? { experimentKey: this.feed.experimentKey, variant }
        : null;
    } catch (err) {
      this.log.warn(`ranker assign skipped: ${String(err)}`);
      return null;
    }
  }

  /** True for the arm of this feed's test that the model ranks. */
  isModelArm(a: Assignment | null | undefined): boolean {
    return isModelArmOf(this.feed.experimentKey, a);
  }

  /**
   * Whether this ranker wants training data now: its mode is not off.
   * While it is on or «Авто», the ranking events log keeps the sampled
   * impressions of this feed even with no experiment running (otherwise
   * «Авто» could never get the first model: nothing to train on).
   */
  async wantsTrainingData(): Promise<boolean> {
    try {
      return (await this.config()).mode !== 'off';
    } catch {
      return false;
    }
  }

  /** Why [m] cannot be this feed's model (null = fine). */
  manifestProblem(m: unknown): string | null {
    return manifestProblemFor(this.feed.spec, m);
  }

  /** What served lists of the model arm are tagged with (≤ 32 chars). */
  formulaVersion(): string | null {
    const v = this.loaded?.manifest.version;
    return v ? `ranker:${v}`.slice(0, 32) : null;
  }

  /** How many of the formula's best candidates the model re-orders. */
  async topN(): Promise<number> {
    return (await this.config()).topN;
  }

  /**
   * Model scores of [rows] (logged-style feature objects), in order; null
   * when no model is loaded or scoring failed — the caller keeps the
   * formula's order.
   */
  async score(
    rows: readonly Readonly<Record<string, unknown>>[],
  ): Promise<Float32Array | null> {
    const m = this.loaded;
    if (!m || rows.length === 0) return null;
    const t0 = performance.now();
    try {
      const o = await ort();
      const width = this.feed.spec.features.length;
      const input = new o.Tensor('float32', toMatrixBy(this.feed.spec, rows), [
        rows.length,
        width,
      ]);
      const out = await m.session.run({ [m.input]: input });
      const data = out[m.output]?.data;
      if (!(data instanceof Float32Array) || data.length !== rows.length) {
        throw new Error(`model output has the wrong shape`);
      }
      return data;
    } catch (err) {
      this.log.warn(`ranker scoring failed, formula kept: ${String(err)}`);
      return null;
    } finally {
      this.noteLatency(performance.now() - t0);
    }
  }

  /** For the admin and the tests: what is loaded and why not. */
  status(): {
    feed: string;
    loaded: string | null;
    version: string | null;
    failed: string | null;
    p95Ms: number;
  } {
    return {
      feed: this.feed.feed,
      loaded: this.loaded?.key ?? null,
      version: this.loaded?.manifest.version ?? null,
      failed: this.failed?.why ?? null,
      p95Ms: p95(this.latencies),
    };
  }

  /** Loads [key] now and waits (tests, warm-up). */
  async ensureLoaded(key?: string): Promise<boolean> {
    const k = key ?? (await this.config()).key;
    if (!k) return false;
    this.model(k);
    await this.loading;
    return this.loaded?.key === k;
  }

  // ---------------------------------------------------------------------

  private usable(s: Settings, m: Loaded): boolean {
    if (s.mode === 'on') return true;
    // «Авто»: only a model that beat the formula offline, and only while
    // its scoring stays inside the budget.
    const met = m.manifest.metrics;
    const better =
      typeof met?.ndcg_model === 'number' &&
      typeof met?.ndcg_formula === 'number' &&
      met.ndcg_model > met.ndcg_formula;
    if (!better) return false;
    if (Date.now() < this.coolUntil) return false;
    if (this.latencies.length >= 20 && p95(this.latencies) > s.budgetMs) {
      this.coolUntil = Date.now() + LATENCY_COOLDOWN_MS;
      this.latencies.length = 0;
      this.log.warn(
        `ranker «Авто»: scoring p95 over ${s.budgetMs} ms, formula for ${LATENCY_COOLDOWN_MS / 60_000} min`,
      );
      return false;
    }
    return true;
  }

  private noteLatency(ms: number): void {
    this.latencies.push(ms);
    if (this.latencies.length > LATENCY_WINDOW) this.latencies.shift();
  }

  /** The loaded model of [key], or null while it loads / after it failed. */
  private model(key: string): Loaded | null {
    if (this.loaded?.key === key) return this.loaded;
    if (this.loading) return null;
    if (this.failed?.key === key && Date.now() - this.failed.at < RETRY_MS) {
      return null;
    }
    this.loading = this.load(key).finally(() => {
      this.loading = null;
    });
    return null;
  }

  private async load(key: string): Promise<void> {
    try {
      const dir = key.slice(0, key.lastIndexOf('/') + 1);
      const [bytes, rawManifest] = await Promise.all([
        this.read(key),
        this.read(`${dir}manifest.json`),
      ]);
      const manifest = JSON.parse(rawManifest.toString('utf8')) as unknown;
      const problem = this.manifestProblem(manifest);
      if (problem) throw new Error(problem);
      const m = manifest as RankerManifest;
      if (m.sha256) {
        const { createHash } = await import('node:crypto');
        const got = createHash('sha256').update(bytes).digest('hex');
        if (got !== m.sha256)
          throw new Error('model.onnx does not match its manifest sha256');
      }
      const o = await ort();
      const session = await o.InferenceSession.create(new Uint8Array(bytes));
      const input = m.input_name ?? session.inputNames[0];
      if (!session.inputNames.includes(input)) {
        throw new Error(`model has no input ${input}`);
      }
      this.loaded = {
        key,
        manifest: m,
        session,
        input,
        output: session.outputNames[0],
      };
      this.failed = null;
      this.latencies.length = 0;
      this.log.log(`ranker model ${m.version} loaded from ${key}`);
    } catch (err) {
      this.failed = { key, at: Date.now(), why: String(err) };
      this.log.warn(
        `ranker model ${key} not loaded, formula kept: ${String(err)}`,
      );
    }
  }

  /** S3 (documents bucket) — or, outside production, `file:/abs/path`. */
  private async read(key: string): Promise<Buffer> {
    if (key.startsWith('file:')) {
      const path = key.slice('file:'.length);
      if (process.env.NODE_ENV === 'production' || !isAbsolute(path)) {
        throw new Error('file: model keys are for local runs only');
      }
      return readFile(path);
    }
    if (this.source) return this.source.read(key);
    if (!this.s3) throw new Error('no S3 storage in this process');
    return this.s3(key);
  }

  private setting(name: string): AppSettingKey {
    return `${this.feed.settingsPrefix}.${name}` as AppSettingKey;
  }

  private async config(): Promise<Settings> {
    const now = Date.now();
    if (this.cfg && now - this.cfg.at < SETTINGS_TTL_MS) return this.cfg;
    const d = APP_SETTINGS as Record<string, unknown>;
    const k = {
      mode: this.setting('mode'),
      traffic: this.setting('traffic_percent'),
      share: this.setting('model_share_percent'),
      key: this.setting('model_key'),
      topN: this.setting('top_n'),
      budget: this.setting('latency_budget_ms'),
    };
    const text = (v: unknown, dflt: string) =>
      typeof v === 'string' ? v : dflt;
    let mode = text(d[k.mode], 'off');
    let traffic = Number(d[k.traffic] ?? 0);
    let share = Number(d[k.share] ?? 0);
    let key = text(d[k.key], '');
    let topN = Number(d[k.topN] ?? 100);
    let budgetMs = Number(d[k.budget] ?? 15);
    try {
      if (this.settings) {
        [mode, traffic, share, key, topN, budgetMs] = await Promise.all([
          this.settings.string(k.mode),
          this.settings.number(k.traffic),
          this.settings.number(k.share),
          this.settings.string(k.key),
          this.settings.number(k.topN),
          this.settings.number(k.budget),
        ]);
      }
    } catch {
      // settings unreadable: the built-in defaults (no model key = formula)
    }
    const clamp = (v: number, lo: number, hi: number) =>
      Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
    key = key.trim();
    const keyOk =
      this.feed.modelKeyRe.test(key) ||
      (key.startsWith('file:') && process.env.NODE_ENV !== 'production');
    this.cfg = {
      at: now,
      mode: mode === 'on' || mode === 'auto' ? mode : 'off',
      traffic: clamp(traffic, 0, 100),
      share: Math.round(clamp(share, 0, 100)),
      key: keyOk ? key : '',
      topN: Math.floor(clamp(topN, 1, 400)),
      budgetMs: clamp(budgetMs, 1, 1000),
    };
    return this.cfg;
  }
}

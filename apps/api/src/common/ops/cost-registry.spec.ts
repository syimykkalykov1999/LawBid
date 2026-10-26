import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { APP_SETTINGS } from '../app-settings/app-settings.defaults';
import { COST_PROVIDERS } from '../cost-guard/cost-guard.constants';
import { PROVIDERS } from '../secrets/provider-registry';
import {
  COST_REGISTRY,
  LADDER_USERS,
  dayOneTotals,
  entryById,
  mid,
  stepsFor,
  totalAt,
  totalAtUsers,
} from './cost-registry';

const REPO = resolve(__dirname, '../../../../..');
const INFRA = join(REPO, 'infra');

/** Every .tf file under infra/ (skipping Terraform's own caches). */
function tfFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === '.terraform' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tfFiles(p, out);
    else if (name.endsWith('.tf')) out.push(p);
  }
  return out;
}

const allTf = tfFiles(INFRA).map((p) => readFileSync(p, 'utf8'));

describe('cost registry: CI gate (nothing billable without a row)', () => {
  it('every aws_* resource type created in infra/** has a registry entry', () => {
    const types = new Set<string>();
    for (const src of allTf) {
      for (const m of src.matchAll(/^resource\s+"(aws_[a-z0-9_]+)"/gm)) {
        types.add(m[1]);
      }
    }
    expect(types.size).toBeGreaterThan(100); // the grep itself works
    const claimed = new Set(COST_REGISTRY.flatMap((e) => e.awsTypes ?? []));
    const missing = [...types].filter((t) => !claimed.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it('every provider in provider-registry.ts has a registry entry', () => {
    const claimed = new Set(COST_REGISTRY.flatMap((e) => e.providers ?? []));
    const missing = PROVIDERS.map((p) => p.id)
      .filter((id) => !claimed.has(id))
      .sort();
    expect(missing).toEqual([]);
  });

  it('every cost-guard provider has a registry row with its cap (switch or ceiling)', () => {
    for (const p of COST_PROVIDERS) {
      const key = `budget.${p}.monthly_max`;
      const hit = COST_REGISTRY.find(
        (e) =>
          (e.control.type === 'app-setting' && e.control.key === key) ||
          e.ceiling?.key === key,
      );
      // `storage` is the S3 upload cap: it rides on the S3 / R2 rows.
      if (p === 'storage') continue;
      expect(hit).toBeDefined();
    }
  });

  it('every Terraform variable named by a tfvars control exists in the prod env', () => {
    const prodDir = join(INFRA, 'envs/prod');
    const prod = readdirSync(prodDir)
      .filter((n) => n.endsWith('.tf'))
      .map((n) => readFileSync(join(prodDir, n), 'utf8'))
      .join('\n');
    const declared = new Set(
      [...prod.matchAll(/^variable\s+"([a-z0-9_]+)"/gm)].map((m) => m[1]),
    );
    const missing: string[] = [];
    for (const e of COST_REGISTRY) {
      if (e.control.type !== 'tfvars') continue;
      for (const v of e.control.vars) {
        const root = v.split('.')[0];
        // `variable "x"` or a name the stack module takes through `growth`.
        if (!declared.has(root)) missing.push(`${e.id}: ${v}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('app-setting controls point at real settings', () => {
    const capKey = new RegExp(
      `^budget\\.(${COST_PROVIDERS.join('|')})\\.monthly_max$`,
    );
    for (const e of COST_REGISTRY) {
      if (e.control.type !== 'app-setting') continue;
      const key = e.control.key;
      expect(key in APP_SETTINGS || capKey.test(key)).toBe(true);
    }
  });
});

describe('cost registry: content rules', () => {
  it('ids are unique and names / purposes are plain Russian text', () => {
    const ids = COST_REGISTRY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of COST_REGISTRY) {
      expect(e.name.length).toBeGreaterThan(3);
      expect(e.purpose.length).toBeGreaterThan(10);
      expect(e.neededNote.length).toBeGreaterThan(3);
      expect(/[А-Яа-я]/.test(e.name)).toBe(true);
    }
  });

  it('every price has a source URL and a check date', () => {
    for (const e of COST_REGISTRY) {
      expect(e.price.sourceUrl).toMatch(/^https:\/\//);
      expect(e.price.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.price.text.length).toBeGreaterThan(3);
    }
  });

  it('the default state is one of the supported states', () => {
    for (const e of COST_REGISTRY) {
      expect(e.states).toContain(e.defaultState);
    }
  });

  it('an item that is OFF by default costs nothing at launch and says what it adds', () => {
    for (const e of COST_REGISTRY) {
      if (e.defaultState !== 'off') continue;
      expect(mid(e.usd.launch)).toBe(0);
    }
    const offWithAdd = COST_REGISTRY.filter(
      (e) => e.defaultState === 'off' && e.ifOnUsd,
    );
    expect(offWithAdd.length).toBeGreaterThan(10);
  });

  it('every item that can be switched has steps for each of its states', () => {
    for (const e of COST_REGISTRY) {
      for (const st of e.states) {
        const steps = stepsFor(e, st);
        expect(steps.length).toBeGreaterThan(0);
      }
    }
  });

  it('three-state items default to Авто (or Выкл when useless at launch)', () => {
    for (const e of COST_REGISTRY) {
      if (!e.states.includes('auto')) continue;
      if (e.control.type === 'tfvars') continue;
      expect(['auto', 'off', 'on']).toContain(e.defaultState);
    }
    expect(entryById('aws.db_autoscale')?.defaultState).toBe('auto');
    expect(entryById('aws.redis_autoscale')?.defaultState).toBe('auto');
  });

  it('GuardDuty, both WAFs and CloudFront carry an alarm', () => {
    for (const id of [
      'aws.guardduty',
      'aws.waf_alb',
      'aws.waf_cdn',
      'aws.cloudfront',
    ]) {
      expect(entryById(id)?.alarm).toBeTruthy();
    }
  });
});

describe('cost registry: hidden costs and load (owner rule)', () => {
  it('lists the things that charge or load us just by running, each with a load note', () => {
    const hidden = COST_REGISTRY.filter((e) => e.id.startsWith('hidden.'));
    expect(hidden.length).toBeGreaterThanOrEqual(8);
    for (const e of hidden) expect(e.neededNote).toContain('Нагрузка');
    for (const id of [
      'hidden.cost_explorer_reads',
      'hidden.economy_tick',
      'hidden.cron_jobs',
      'hidden.logs_metrics',
      'hidden.cdn_invalidations',
    ]) {
      expect(entryById(id)).toBeDefined();
    }
  });
});

describe('cost registry: the ladder numbers', () => {
  it('day-1 total is the real ≈ $277–287, not the old $150-170', () => {
    const t = dayOneTotals();
    expect(t.aws[0]).toBeGreaterThanOrEqual(255);
    expect(t.aws[1]).toBeLessThanOrEqual(275);
    expect(t.all[0]).toBeGreaterThanOrEqual(262);
    expect(t.all[1]).toBeLessThanOrEqual(295);
  });

  it('the bill grows with users and the points are ordered', () => {
    const pts = LADDER_USERS.map((u) => mid(totalAtUsers(u)));
    for (let i = 1; i < pts.length; i++)
      expect(pts[i]).toBeGreaterThan(pts[i - 1]);
    expect(totalAtUsers(1_000_000)).toEqual(totalAt('m1'));
    expect(totalAtUsers(100_000)).toEqual(totalAt('k100'));
  });
});

describe('cost registry: generated documents never drift', () => {
  it('COST_LADDER.md and the admin guide match the registry (run apps/api/scripts/cost-ladder.mjs)', () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [
          '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON',
          join(REPO, 'apps/api/scripts/cost-ladder.mjs'),
          '--check',
        ],
        { stdio: 'pipe' },
      ),
    ).not.toThrow();
  });
});

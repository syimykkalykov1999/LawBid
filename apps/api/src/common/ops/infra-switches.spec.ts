import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { COST_REGISTRY } from './cost-registry';
import {
  FORBIDDEN_DESTROY,
  INFRA_KEYS,
  INFRA_SWITCHES,
  applyToFile,
  checkValue,
  fileProblems,
  fileSchema,
  forbiddenDestroys,
  valueInFile,
} from './infra-switches';

/**
 * Owner 2026-10-26: infra switches from the admin. The whitelist is the
 * safety: these tests fail when a key outside it could be written, when it
 * names a Terraform variable that does not exist (or of another type), when
 * the committed JSON schema / file drift from it, and when the CI scripts
 * disagree with the API.
 */
const ROOT = join(__dirname, '../../../../..');
const PROD = join(ROOT, 'infra/envs/prod');
const SCHEMA_PATH = join(PROD, 'growth.auto.tfvars.schema.json');

function tfVariableType(name: string): string | null {
  const src = readFileSync(join(PROD, 'variables.tf'), 'utf8');
  const m = new RegExp(
    `variable\\s+"${name}"\\s*\\{[\\s\\S]*?type\\s*=\\s*([a-z]+)`,
  ).exec(src);
  return m ? m[1] : null;
}

describe('infra switch whitelist', () => {
  it('every switch is a Terraform row of the cost registry with Выкл and Вкл and a price', () => {
    for (const sw of INFRA_SWITCHES) {
      const e = COST_REGISTRY.find((x) => x.id === sw.id);
      expect(e).toBeDefined();
      expect(e!.control.type).toBe('tfvars');
      expect(e!.states).toEqual(expect.arrayContaining(['off', 'on']));
      expect(e!.price.text.length).toBeGreaterThan(0);
      expect(e!.price.sourceUrl).toMatch(/^https:\/\//);
      for (const t of ['off', 'on'] as const) {
        for (const [k, v] of Object.entries(sw.values[t])) {
          expect([k, checkValue(k, v)]).toEqual([k, null]);
        }
      }
    }
    expect(new Set(INFRA_SWITCHES.map((s) => s.id)).size).toBe(
      INFRA_SWITCHES.length,
    );
  });

  it('never offers rows whose Выкл loses data or needs a secret', () => {
    const ids = INFRA_SWITCHES.map((s) => s.id);
    for (const id of ['aws.backup', 'aws.rds_proxy', 'aws.rds', 'aws.redis']) {
      expect(ids).not.toContain(id);
    }
    const keys = Object.keys(INFRA_KEYS).join(' ');
    expect(keys).not.toMatch(/arn|secret|password|token|key_id|image/i);
  });

  it('every key is a real prod variable of the same type', () => {
    const stack = readFileSync(
      join(ROOT, 'infra/modules/stack/growth.tf'),
      'utf8',
    );
    for (const [key, k] of Object.entries(INFRA_KEYS)) {
      if (k.path.length === 2) {
        expect(k.path[0]).toBe('growth_switches');
        const t = new RegExp(`\\b${k.path[1]}\\s*=\\s*optional\\((\\w+)`).exec(
          stack,
        )?.[1];
        expect([key, t]).toEqual([
          key,
          k.spec.type === 'boolean' ? 'bool' : 'number',
        ]);
        continue;
      }
      const want =
        k.spec.type === 'boolean'
          ? 'bool'
          : k.spec.type === 'integer'
            ? 'number'
            : 'string';
      expect([key, tfVariableType(k.path[0])]).toEqual([key, want]);
    }
    expect(readFileSync(join(PROD, 'growth.tf'), 'utf8')).toContain(
      'variable "growth_switches"',
    );
    expect(readFileSync(join(PROD, 'main.tf'), 'utf8')).toContain(
      'merge(var.growth, var.growth_switches)',
    );
  });

  it('the committed JSON schema is generated from the whitelist', () => {
    const want = `${JSON.stringify(fileSchema(), null, 2)}\n`;
    if (process.env.UPDATE_INFRA_SCHEMA === '1') {
      writeFileSync(SCHEMA_PATH, want);
    }
    expect(readFileSync(SCHEMA_PATH, 'utf8')).toBe(want);
  });

  it('the committed growth.auto.tfvars.json holds only whitelisted keys', () => {
    const file = JSON.parse(
      readFileSync(join(PROD, 'growth.auto.tfvars.json'), 'utf8'),
    ) as Record<string, unknown>;
    expect(fileProblems(file)).toEqual([]);
  });

  it('no non-whitelisted key or value can be written', () => {
    const bad: Record<string, unknown>[] = [
      { database_multi_az: false },
      { existing_database_identifier: 'x' },
      { 'growth.db_proxy_secret_arn': 'arn:aws:secretsmanager:x' },
      { 'growth.rds_read_replicas': 6 },
      { 'growth.rds_read_replicas': 1.5 },
      { waf_enabled: 'false' },
      { uptime_check: 'pingdom' },
      { growth_switches: { rds_read_replicas: 1 } },
      { backup_enabled: false },
    ];
    for (const c of bad) {
      expect(() => applyToFile({}, c as never)).toThrow();
    }
    // A foreign key already in the file is refused too.
    expect(() =>
      applyToFile({ alert_emails: ['x'] }, { waf_enabled: true }),
    ).toThrow(/not in the whitelist/);
    expect(
      fileProblems({ growth_switches: { db_proxy_enabled: true } }),
    ).toEqual(['key growth_switches.db_proxy_enabled is not in the whitelist']);
    const ok = applyToFile(
      { waf_enabled: true },
      { 'growth.rds_read_replicas': 2, waf_enabled: false },
    );
    expect(ok).toEqual({
      waf_enabled: false,
      growth_switches: { rds_read_replicas: 2 },
    });
    expect(valueInFile(ok, 'growth.rds_read_replicas')).toBe(2);
  });

  it('the CI writer script refuses the same things and writes the same file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'infra-switch-'));
    const file = join(dir, 'f.json');
    const script = join(ROOT, 'scripts/infra/write-switch.mjs');
    writeFileSync(file, '{}\n');
    const run = (changes: unknown) =>
      execFileSync(
        process.execPath,
        [script, file, SCHEMA_PATH, JSON.stringify(changes)],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      );
    expect(() => run({ database_multi_az: false })).toThrow();
    expect(() => run({ 'growth.db_proxy_secret_arn': 'x' })).toThrow();
    expect(() => run({ api_min_tasks: 9 })).toThrow();
    expect(readFileSync(file, 'utf8')).toBe('{}\n');
    const out = JSON.parse(
      run({ 'growth.rds_read_replicas': 1, waf_enabled: false }),
    ) as { before: Record<string, unknown> };
    expect(out.before).toEqual({
      'growth.rds_read_replicas': null,
      waf_enabled: null,
    });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(
      applyToFile({}, { 'growth.rds_read_replicas': 1, waf_enabled: false }),
    );
  });

  it('a plan may drop the read replica but never data', () => {
    expect(
      forbiddenDestroys([
        {
          address: 'module.stack.module.growth.aws_db_instance.replica[0]',
          action: 'delete',
        },
        { address: 'module.stack.aws_wafv2_web_acl.bots', action: 'delete' },
        {
          address: 'module.stack.module.postgres.aws_db_instance.this',
          action: 'delete-create',
        },
        { address: 'module.stack.aws_s3_bucket.media', action: 'update' },
        { address: 'module.stack.aws_kms_key.main', action: 'delete' },
      ]),
    ).toEqual([
      'module.stack.module.postgres.aws_db_instance.this',
      'module.stack.aws_kms_key.main',
    ]);
  });

  it('the CI plan summary uses the same forbidden list', () => {
    const src = readFileSync(
      join(ROOT, 'scripts/infra/plan-summary.mjs'),
      'utf8',
    );
    const list = /FORBIDDEN_DESTROY = \[([\s\S]*?)\]/.exec(src)![1];
    const names = [...list.matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(names).toEqual([...FORBIDDEN_DESTROY]);
  });
});

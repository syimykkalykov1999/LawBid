import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Source-level guards of AI mode (plan F: «ИИ не единственный судья»; owner:
 * off = not one call). They read the module's own files, so a later edit
 * that breaks a rule fails here.
 */
const DIR = __dirname;
const files = readdirSync(DIR)
  .filter(
    (f) =>
      f.endsWith('.ts') &&
      !f.endsWith('.spec.ts') &&
      !f.includes('test-support'),
  )
  .map((f) => ({ f, src: readFileSync(path.join(DIR, f), 'utf8') }));
const jobSrc = readFileSync(
  path.join(DIR, '../../jobs/handlers/staff-ai-qa-nightly.job.ts'),
  'utf8',
);
const all = [...files, { f: 'job', src: jobSrc }];

/** jest's expect takes no message: report the file name in the diff instead. */
function none(file: string, src: string, re: RegExp): void {
  expect({ file, found: re.test(src) }).toEqual({ file, found: false });
}

describe('staff AI mode: structural guards', () => {
  it('the AI never writes staff_actions, suggestions or ratings: only signals, samples and its own config rows', () => {
    for (const { f, src } of all) {
      none(f, src, /staffAction\b/);
      none(f, src, /staffSuggestion\.(create|update|upsert|delete)/);
      none(f, src, /staffRatingSnapshot\.(create|update|upsert|delete)/);
      none(f, src, /\$executeRaw|\$queryRaw/);
    }
  });

  it('only the client talks to the network and reads the key; no key in env or code', () => {
    for (const { f, src } of all) {
      if (f !== 'staff-ai-client.service.ts' && f !== 'staff-ai.module.ts') {
        none(f, src, /\bfetch\(/);
        none(f, src, /api\.anthropic\.com/);
      }
      none(f, src, /process\.env/);
      none(f, src, /sk-ant-[A-Za-z0-9_-]{20,}/);
    }
    expect(
      files.find((x) => x.f === 'staff-ai-client.service.ts')?.src,
    ).toContain("secrets.field(SECRET_PROVIDER, 'apiKey')");
  });

  it('every model call site goes through StaffAiClient (the feature gate and the budget)', () => {
    for (const { f, src } of all) {
      if (f === 'staff-ai-client.service.ts') continue;
      none(f, src, /\.http\(|new Anthropic|@anthropic-ai/);
    }
  });

  it('models are the exact ids, never date-suffixed, and no sampling parameters are sent', () => {
    const src = files.map((x) => x.src).join('\n');
    expect(src).toContain("'claude-haiku-5-5'");
    expect(src).toContain("'claude-sonnet-5-5'");
    expect(src).not.toMatch(/claude-[a-z]+-\d(-\d)?-20\d{6}/);
    expect(src).not.toMatch(/temperature|top_p|top_k|budget_tokens/);
  });
});

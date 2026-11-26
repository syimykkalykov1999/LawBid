import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

/**
 * DAST 26.11 (Schemathesis, api-dast.yml): class-validator's
 * `@ValidateNested()` does not reject a MISSING nested object, so a body
 * without `filter` / `texts` / `dmcaAgent` passed validation and the service
 * crashed on `undefined.x` (500). Every required nested field (`name!:`) must
 * also say `@IsDefined()` (or `@IsObject()` / `@IsArray()`), unless it is
 * `@IsOptional()`. This keeps new DTOs from bringing the 500 back.
 */
const SRC = join(__dirname, '..', '..');
const GUARD =
  /@(IsDefined|IsObject|IsArray|ArrayMinSize|ArrayNotEmpty|IsNotEmptyObject|IsOptional|ValidateIf)\b/;
const PROP = /^\s+\w+[!?]?\s*:|^\s+\w+\s*=/;

function tsFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'generated' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsFiles(p, out);
    else if (name.endsWith('.ts') && !name.endsWith('.spec.ts')) out.push(p);
  }
  return out;
}

/** Decorator lines (and their wrapped arguments) right above `lines[at]`. */
function decoratorBlock(lines: string[], at: number): string {
  let k = at;
  while (k > 0) {
    const t = lines[k - 1].trim();
    if (t === '' || t.endsWith(';') || t.startsWith('//') || t.startsWith('*'))
      break;
    if (/^(export\s+)?(abstract\s+)?class\b/.test(t)) break;
    if (PROP.test(lines[k - 1]) && !t.startsWith('@')) break;
    k -= 1;
  }
  return lines.slice(k, at + 1).join('\n');
}

export function requiredNestedWithoutDefined(files: string[]): string[] {
  const bad: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('@ValidateNested(')) continue;
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (!line.trim().startsWith('@ValidateNested(')) return;
      let j = i;
      while (j < lines.length && !PROP.test(lines[j])) j += 1;
      if (j >= lines.length || !lines[j].includes('!:')) return;
      if (!GUARD.test(decoratorBlock(lines, j))) {
        bad.push(`${relative(SRC, file)}:${j + 1} ${lines[j].trim()}`);
      }
    });
  }
  return bad;
}

describe('DTOs: a required nested object is checked for presence', () => {
  it('the check finds a required nested field without @IsDefined()', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nested-required-'));
    const file = join(dir, 'sample.dto.ts');
    writeFileSync(
      file,
      [
        'export class A {',
        '  @ApiProperty({ type: () => B })',
        '  @ValidateNested()',
        '  @Type(() => B)',
        '  filter!: B;',
        '',
        '  @IsDefined()',
        '  @ValidateNested()',
        '  @Type(() => B)',
        '  ok!: B;',
        '',
        '  @IsOptional()',
        '  @ValidateNested()',
        '  @Type(() => B)',
        '  maybe?: B;',
        '}',
      ].join('\n'),
    );
    const found = requiredNestedWithoutDefined([file]);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('filter!: B;');
  });

  it('every required @ValidateNested() field also has @IsDefined()', () => {
    expect(requiredNestedWithoutDefined(tsFiles(SRC))).toEqual([]);
  });
});

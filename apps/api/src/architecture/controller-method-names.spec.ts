import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * KNOWN_ERRORS 205 (17.11, #1220): NestJS 12.5 maps the routes of EVERY
 * controller for wildcard middleware (`forRoutes('{*splat}')`) through
 * `Object.create(Controller)[methodName]`. A controller method named like a
 * strict-mode accessor of Function.prototype (`caller`, `callee`,
 * `arguments`) makes that read throw, and the app does not boot:
 * "'caller', 'callee', and 'arguments' properties may not be accessed on
 * strict mode functions". Two workflow controllers had a private `caller()`.
 */
const SRC = resolve(__dirname, '..');
const FORBIDDEN =
  /^\s*(?:(?:public|private|protected|static|async|override|readonly)\s+)*(caller|callee|arguments)\s*[(<]/m;

function controllers(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) controllers(p, out);
    else if (name.endsWith('.controller.ts')) out.push(p);
  }
  return out;
}

describe('controller method names', () => {
  it('no controller method is named like a Function.prototype accessor', () => {
    const files = controllers(SRC);
    expect(files.length).toBeGreaterThan(100);
    const bad = files
      .filter((f) => FORBIDDEN.test(readFileSync(f, 'utf8')))
      .map((f) => relative(SRC, f));
    expect(bad).toEqual([]);
  });

  it('the pattern catches the case that broke the boot', () => {
    expect(FORBIDDEN.test('  private async caller(auth: string) {')).toBe(true);
    expect(FORBIDDEN.test('  arguments<T>() {')).toBe(true);
    expect(FORBIDDEN.test('    const c = await this.caller(auth);')).toBe(
      false,
    );
    expect(FORBIDDEN.test('  private async workflowCaller(auth) {')).toBe(
      false,
    );
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import * as ts from 'typescript';

/**
 * M5 (docs/dev/SECOND_PASS_2026-11-26.md; AWS Well-Architected REL05-BP05
 * «Set client timeouts»): the AWS SDK v3 has no request limit by default,
 * and `requestTimeout` alone only logs a warning. Every `new XxxClient(...)`
 * of an `@aws-sdk/client-*` class therefore passes
 * `requestHandler: <one of the shared limits>` from
 * common/http/aws-request-handler.ts — an inline `{ requestTimeout }` is
 * refused, because it looks like a limit and is none.
 */
const SRC = resolve(__dirname, '..');
const API = resolve(SRC, '..');
const ROOTS = ['src', 'scripts', 'bench', 'prisma'].map((d) => join(API, d));
const SHARED = new Set(['AWS_API_REQUEST_HANDLER', 'STORAGE_REQUEST_HANDLER']);

function walk(dir: string, out: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const n of names) {
    const f = join(dir, n);
    // src/generated: Prisma's generated client.
    if (n === 'generated' || n === 'node_modules') continue;
    if (statSync(f).isDirectory()) walk(f, out);
    else if (n.endsWith('.ts') && !n.endsWith('.spec.ts')) out.push(f);
  }
  return out;
}

/** Class names this file takes from an `@aws-sdk/client-*` package,
 * statically or by `const { X } = await import(...)`. */
function sdkClientNames(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const fromSdk = (spec: ts.Node | undefined) =>
    !!spec &&
    ts.isStringLiteral(spec) &&
    spec.text.startsWith('@aws-sdk/client-');
  const visit = (node: ts.Node): void => {
    if (
      ts.isImportDeclaration(node) &&
      fromSdk(node.moduleSpecifier) &&
      node.importClause?.namedBindings &&
      ts.isNamedImports(node.importClause.namedBindings)
    ) {
      for (const el of node.importClause.namedBindings.elements) {
        if (!el.isTypeOnly) names.add(el.name.text);
      }
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) &&
      node.initializer
    ) {
      let init: ts.Expression = node.initializer;
      if (ts.isAwaitExpression(init)) init = init.expression;
      if (
        ts.isCallExpression(init) &&
        init.expression.kind === ts.SyntaxKind.ImportKeyword &&
        fromSdk(init.arguments[0])
      ) {
        for (const el of node.name.elements) {
          if (ts.isIdentifier(el.name)) names.add(el.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return names;
}

/** `requestHandler: SHARED_CONST` or `requestHandler: awsRequestHandler(n)`. */
function hasSharedHandler(arg: ts.Expression | undefined): boolean {
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some((p) => {
    if (!p.name || !ts.isIdentifier(p.name)) return false;
    if (p.name.text !== 'requestHandler') return false;
    if (ts.isShorthandPropertyAssignment(p)) return false;
    if (!ts.isPropertyAssignment(p)) return false;
    const v = p.initializer;
    if (ts.isIdentifier(v)) return SHARED.has(v.text);
    return (
      ts.isCallExpression(v) &&
      ts.isIdentifier(v.expression) &&
      v.expression.text === 'awsRequestHandler'
    );
  });
}

function clientsWithoutTimeout(file: string, text: string): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const names = sdkClientNames(sf);
  const bad: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      names.has(node.expression.text) &&
      node.expression.text.endsWith('Client') &&
      !hasSharedHandler(node.arguments?.[0])
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      bad.push(`${node.expression.text} at line ${line}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bad;
}

describe('AWS SDK clients have a time limit (M5)', () => {
  it('every new @aws-sdk client passes a shared requestHandler limit', () => {
    const offenders: string[] = [];
    let clients = 0;
    for (const root of ROOTS) {
      for (const f of walk(root)) {
        const text = readFileSync(f, 'utf8');
        if (!text.includes('@aws-sdk/client-')) continue;
        clients += (text.match(/new [A-Z]\w*Client\(/g) ?? []).length;
        for (const b of clientsWithoutTimeout(f, text)) {
          offenders.push(`${relative(API, f).split(sep).join('/')}: ${b}`);
        }
      }
    }
    // The scan really sees the clients (a broken walk would pass silently).
    expect(clients).toBeGreaterThan(20);
    expect(offenders).toEqual([]);
  });

  it('flags a client without a limit and an inline limit that only warns', () => {
    const src = [
      "import { S3Client } from '@aws-sdk/client-s3';",
      "const a = new S3Client({ region: 'x' });",
      'const b = new S3Client({ requestHandler: { requestTimeout: 1 } });',
      'const c = new S3Client({ requestHandler: STORAGE_REQUEST_HANDLER });',
      'const d = new S3Client({ requestHandler: awsRequestHandler(5) });',
      'async function e() {',
      "  const { KMSClient } = await import('@aws-sdk/client-kms');",
      '  return new KMSClient({});',
      '}',
    ].join('\n');
    expect(clientsWithoutTimeout('x.ts', src)).toEqual([
      'S3Client at line 2',
      'S3Client at line 3',
      'KMSClient at line 8',
    ]);
  });
});

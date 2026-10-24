import {
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { Prisma } from '@prisma/client';
import * as ts from 'typescript';
import { familyOf } from './shard-manifest';

/**
 * Shard-ready step 0 (docs/architecture/SHARDING_READY.md §5, §7): "an
 * ESLint/arch test flags new cross-family includes so we do not accumulate
 * debt". A Prisma `include` / `select` that walks a relation from a model of
 * one family into a model of another family (e.g. `bid.findMany({ include: {
 * attorney: true } })`, case-family -> User) becomes a cross-database join
 * the day the families live on different servers.
 *
 * This test statically scans every non-spec file under src/ with the
 * TypeScript compiler for `<anything>.<model>.<op>({ include | select })`
 * calls, follows nested include/select objects, and fails on a cross-family
 * relation that is not in cross-family-include.allowlist.json.
 *
 * The allowlist is "today's debt": one entry per `file -> Model.relation`.
 * It is a ratchet: a NEW cross-family include fails, and so does a stale
 * allowlist entry (the include was removed: delete the entry, the list only
 * shrinks). Steps 6+ (UserDirectory, outbox) remove entries.
 *   Regenerate after a deliberate change:
 *   UPDATE_CROSS_FAMILY_ALLOWLIST=1 npx jest cross-family-include
 *
 * Limits (static): an include object built elsewhere and passed in as a
 * variable, a spread, a computed key, or raw SQL is not seen; the model is
 * taken from the delegate property name (`x.bid.findMany` -> Bid).
 */

const SRC = join(__dirname, '..');
const ALLOWLIST = join(__dirname, 'cross-family-include.allowlist.json');

const READ_WRITE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'create',
  'createManyAndReturn',
  'update',
  'upsert',
  'delete',
]);

interface Rel {
  readonly target: string;
}

const delegates = new Map<string, string>(); // `bid` -> `Bid`
const relations = new Map<string, Map<string, Rel>>(); // Model -> field -> rel
for (const m of Prisma.dmmf.datamodel.models) {
  delegates.set(m.name[0].toLowerCase() + m.name.slice(1), m.name);
  const rels = new Map<string, Rel>();
  for (const f of m.fields) {
    if (f.kind === 'object') rels.set(f.name, { target: f.type });
  }
  relations.set(m.name, rels);
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === 'node_modules') continue;
      sourceFiles(p, out);
    } else if (
      p.endsWith('.ts') &&
      !p.endsWith('.spec.ts') &&
      !p.endsWith('.d.ts')
    ) {
      out.push(p);
    }
  }
  return out;
}

function keyName(p: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(p) && !ts.isShorthandPropertyAssignment(p)) {
    return null;
  }
  const n = p.name;
  if (ts.isIdentifier(n) || ts.isStringLiteral(n)) return n.text;
  return null;
}

function walkSelection(
  model: string,
  obj: ts.ObjectLiteralExpression,
  found: Set<string>,
): void {
  const rels = relations.get(model);
  if (!rels) return;
  for (const p of obj.properties) {
    const key = keyName(p);
    if (!key) continue;
    const rel = rels.get(key);
    if (!rel) continue; // scalar, `_count`, or unknown
    if (familyOf(model) !== familyOf(rel.target)) {
      found.add(`${model}.${key}`);
    }
    if (
      ts.isPropertyAssignment(p) &&
      ts.isObjectLiteralExpression(p.initializer)
    ) {
      walkArgs(rel.target, p.initializer, found);
    }
  }
}

/** `{ include?: {...}, select?: {...}, where... }` of a relation or a query. */
function walkArgs(
  model: string,
  args: ts.ObjectLiteralExpression,
  found: Set<string>,
): void {
  for (const p of args.properties) {
    const key = keyName(p);
    if (
      (key === 'include' || key === 'select') &&
      ts.isPropertyAssignment(p) &&
      ts.isObjectLiteralExpression(p.initializer)
    ) {
      walkSelection(model, p.initializer, found);
    }
  }
}

export function scanFile(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  if (!/\b(include|select)\s*:/.test(text)) return [];
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      READ_WRITE_OPS.has(node.expression.name.text) &&
      ts.isPropertyAccessExpression(node.expression.expression)
    ) {
      const model = delegates.get(node.expression.expression.name.text);
      const arg = node.arguments[0];
      if (model && arg && ts.isObjectLiteralExpression(arg)) {
        walkArgs(model, arg, found);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return [...found].sort();
}

function scanAll(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const f of sourceFiles(SRC)) {
    const edges = scanFile(f);
    if (edges.length) result[relative(SRC, f).split('\\').join('/')] = edges;
  }
  return Object.fromEntries(
    Object.entries(result).sort(([a], [b]) => a.localeCompare(b)),
  );
}

describe('no new cross-family includes (shard-ready step 0)', () => {
  const current = scanAll();

  if (process.env.UPDATE_CROSS_FAMILY_ALLOWLIST) {
    it('rewrites the allowlist', () => {
      writeFileSync(ALLOWLIST, JSON.stringify(current, null, 2) + '\n');
    });
    return;
  }

  const allowed: Record<string, string[]> = JSON.parse(
    readFileSync(ALLOWLIST, 'utf8'),
  );

  it('introduces no cross-family include/select that is not allowlisted', () => {
    const added: string[] = [];
    for (const [file, edges] of Object.entries(current)) {
      for (const e of edges) {
        if (!allowed[file]?.includes(e)) added.push(`${file}: ${e}`);
      }
    }
    expect({
      message:
        'New cross-family include (docs/architecture/SHARDING_READY.md §5). ' +
        'Load the other family with a separate query / UserDirectory instead; ' +
        'only if it is truly unavoidable add it to cross-family-include.allowlist.json.',
      added,
    }).toEqual({ message: expect.any(String), added: [] });
  });

  it('has no stale allowlist entries (debt only shrinks: delete fixed entries)', () => {
    const stale: string[] = [];
    for (const [file, edges] of Object.entries(allowed)) {
      for (const e of edges) {
        if (!current[file]?.includes(e)) stale.push(`${file}: ${e}`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('detects a cross-family include in a sample (the scanner works)', () => {
    const tmp = join(tmpdir(), 'shard-scan-sample.ts');
    writeFileSync(
      tmp,
      `declare const p: any;
p.bid.findMany({ include: { attorney: true, offers: true } });
p.case.findFirst({ select: { id: true, client: { select: { id: true } }, bids: { include: { attorney: true } } } });
p.user.findMany({ include: { sessions: true, notifications: true } });
p.notification.findMany({ include: { user: true } });
`,
    );
    try {
      expect(scanFile(tmp)).toEqual([
        'Bid.attorney',
        'Case.client',
        'Notification.user',
        'User.notifications',
      ]);
    } finally {
      unlinkSync(tmp);
    }
  });
});

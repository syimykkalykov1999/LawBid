// docs/02_DATABASE.md §8 stage 2.7: generates docs/db/ERD.md (Mermaid
// erDiagram) from prisma/schema.prisma. `npm run db:erd`; re-run after
// every schema change. A small line parser is enough for this schema's
// conventions (one field per line, @@map on every model).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  pk: boolean;
  unique: boolean;
  relation?: { fields: string[] };
}

interface Model {
  name: string;
  table: string;
  fields: Field[];
  compositeId: string[];
}

const SCALARS = new Set([
  'String',
  'Int',
  'BigInt',
  'Boolean',
  'DateTime',
  'Decimal',
  'Json',
  'Float',
  'Bytes',
]);

function parse(schema: string): { models: Model[]; enums: Set<string> } {
  const enums = new Set(
    [...schema.matchAll(/^enum (\w+) \{/gm)].map((m) => m[1]),
  );
  const models: Model[] = [];
  for (const m of schema.matchAll(/^model (\w+) \{\n([\s\S]*?)\n\}/gm)) {
    const [, name, body] = m;
    const lines = body
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('//'));
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1] ?? name;
    const compositeId =
      /@@id\(\[([^\]]+)\]\)/
        .exec(body)?.[1]
        .split(',')
        .map((s) => s.trim()) ?? [];
    const fields: Field[] = [];
    for (const line of lines) {
      if (line.startsWith('@@')) continue;
      const fm = /^(\w+)\s+([\w]+(?:\("[^"]*"\))?)(\[\])?(\?)?(.*)$/.exec(line);
      if (!fm) continue;
      const [, fname, ftype, list, opt, rest] = fm;
      const rel = /@relation\([^)]*fields:\s*\[([^\]]+)\]/.exec(rest);
      fields.push({
        name: fname,
        type: ftype.replace(/^Unsupported\("(\w+)"\)$/, '$1'),
        optional: Boolean(opt),
        list: Boolean(list),
        pk: /@id\b/.test(rest),
        unique: /@unique\b/.test(rest),
        relation: rel
          ? { fields: rel[1].split(',').map((s) => s.trim()) }
          : undefined,
      });
    }
    models.push({ name, table, fields, compositeId });
  }
  return { models, enums };
}

function render(models: Model[], enums: Set<string>): string {
  const byName = new Map(models.map((m) => [m.name, m]));
  const out: string[] = [
    '# LawBid — ERD',
    '',
    'Generated from `apps/api/prisma/schema.prisma` by',
    '`npm run db:erd --workspace apps/api` (docs/02_DATABASE.md §8, stage',
    '2.7). Do not edit by hand. Computed columns, partial / hash-sharded /',
    'GIN indexes, CHECKs and DB roles live in raw-SQL migrations and are not',
    'drawn here.',
    '',
    `${models.length} tables.`,
    '',
    '```mermaid',
    'erDiagram',
  ];
  for (const m of models) {
    out.push(`  ${m.table} {`);
    for (const f of m.fields) {
      const target = byName.get(f.type);
      if (target || f.list) continue;
      const type = SCALARS.has(f.type)
        ? f.type
        : enums.has(f.type)
          ? `enum_${f.type}`
          : f.type;
      const keys: string[] = [];
      if (f.pk || m.compositeId.includes(f.name)) keys.push('PK');
      const isFk = m.fields.some((o) => o.relation?.fields.includes(f.name));
      if (isFk) keys.push('FK');
      if (f.unique) keys.push('UK');
      out.push(
        `    ${type} ${f.name}${keys.length ? ` ${keys.join(',')}` : ''}${f.optional ? ' "nullable"' : ''}`,
      );
    }
    out.push('  }');
  }
  for (const m of models) {
    for (const f of m.fields) {
      const target = byName.get(f.type);
      if (!target || !f.relation) continue;
      // child }o--|| parent (or |o when the FK is also unique = 1:1)
      const fkUnique =
        f.relation.fields.length === 1 &&
        (m.fields.find((x) => x.name === f.relation!.fields[0])?.unique ||
          m.fields.find((x) => x.name === f.relation!.fields[0])?.pk);
      const left = fkUnique ? '|o' : '}o';
      const right = f.optional ? 'o|' : '||';
      out.push(
        `  ${m.table} ${left}--${right} ${target.table} : "${f.relation.fields.join(', ')}"`,
      );
    }
  }
  out.push('```', '');
  return out.join('\n');
}

const root = join(__dirname, '..');
const { models, enums } = parse(
  readFileSync(join(root, 'prisma/schema.prisma'), 'utf-8'),
);
const outDir = join(root, '../../docs/db');
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'ERD.md'), render(models, enums));
process.stdout.write(`ERD: ${models.length} tables -> docs/db/ERD.md\n`);

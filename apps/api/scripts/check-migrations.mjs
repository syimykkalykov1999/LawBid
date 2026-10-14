#!/usr/bin/env node
// Zero maintenance (owner 2026-10-05): migrations are expand/contract only
// (docs/02 §7.1), so the previous release keeps working during a rolling
// deploy and the one-button rollback (.github/workflows/rollback.yml) never
// meets a schema it cannot read. This check refuses, in every migration
// newer than BASELINE, the statements that break the running release:
// dropping or renaming a table or column, changing a column's type, and
// adding a NOT NULL column without a DEFAULT (computed columns are fine).
//
// A contract step that is really meant (the old release no longer reads
// the column) carries a line `-- migration-safety: contract <why>` in the
// same file; the check then lets it through and prints the reason.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE = '20261014100000_postgres_baseline';
const dir = join(import.meta.dirname, '..', 'prisma', 'migrations');

const RULES = [
  [/\bDROP\s+TABLE\b/i, 'drops a table'],
  [/\bDROP\s+COLUMN\b/i, 'drops a column'],
  [/\bRENAME\s+(COLUMN\s+|TO\b)/i, 'renames a table or column'],
  [/\bALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE\b/i, 'changes a column type'],
  [/\bADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?\S+\s+[^,;]*\bNOT\s+NULL\b(?![^,;]*\b(?:DEFAULT|AS)\b)/i, 'adds a NOT NULL column without DEFAULT'],
];

// Widening a text column (`ALTER COLUMN x TYPE VARCHAR(n)` / `STRING(n)`
// without USING) is a safe expand step: the previous release reads and
// writes the same values, and a rollback only meets longer values it never
// writes. The script cannot see the old length, so a narrowing change must
// still be reviewed by hand (it needs a USING clause or a waiver in practice).
const WIDENING =
  /\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\s+(?:VARCHAR|STRING|CHAR(?:ACTER)?(?:\s+VARYING)?)\s*\(\s*\d+\s*\)(?![^;,]*\bUSING\b)/gi;

const stripComments = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

let failed = 0;
const names = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name > BASELINE)
  .map((d) => d.name)
  .sort();
for (const name of names) {
  const raw = readFileSync(join(dir, name, 'migration.sql'), 'utf8');
  const waiver = /^--\s*migration-safety:\s*contract\b(.*)$/im.exec(raw);
  const sql = stripComments(raw).replace(WIDENING, '');
  for (const [re, what] of RULES) {
    if (!re.test(sql)) continue;
    if (waiver) {
      console.log(`${name}: ${what} — allowed (contract:${waiver[1] || ' no reason given'})`);
    } else {
      console.error(
        `${name}: ${what}. Not safe for a rolling deploy / rollback. ` +
          'Split it: add the new shape now, remove the old one in a later release, ' +
          'and mark that later migration with "-- migration-safety: contract <why>".',
      );
      failed++;
    }
  }
}
console.log(`checked ${names.length} migration(s) after ${BASELINE}`);
process.exit(failed ? 1 : 0);

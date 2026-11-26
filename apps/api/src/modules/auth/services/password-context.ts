import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import { adjacencyGraphs } from '@zxcvbn-ts/language-common';

/**
 * ASVS 5.0 V6.1.2 + V6.2.11 (STAGE2_SECURITY #11): a new password must not
 * be built from words tied to this service or this person — «lawbid», the
 * user's name, username, phone digits, the e-mail's local part. NIST SP
 * 800-63B-4 §3.1.1.2 lists «context-specific words, such as the name of the
 * service, the username, and derivatives thereof» in the blocklist.
 *
 * The matching is zxcvbn's (Dropbox), in the maintained TypeScript port
 * zxcvbn-ts (MIT, `@zxcvbn-ts/core` + the keyboard graphs of
 * `@zxcvbn-ts/language-common`): its `userInputs` dictionary finds the words
 * also reversed, in l33t (`L4wB1d`) and in any case. Only the user-input
 * words are loaded as a dictionary, so the check says one thing: how much of
 * the password IS those words. At least half → refused («LawBid2026!»,
 * «john.smith1990»); a long passphrase that merely contains the name passes.
 */
export const CONTEXT_COVERAGE_LIMIT = 0.5;

/** Who sets the password (every field optional). */
export interface PasswordContext {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
}

let factory: ZxcvbnFactory | null = null;
function zxcvbn(): ZxcvbnFactory {
  // No dictionaries but the per-call user inputs; the keyboard graphs keep
  // the other zxcvbn patterns (sequences, spatial) in the decomposition.
  factory ??= new ZxcvbnFactory({ graphs: adjacencyGraphs, dictionary: {} });
  return factory;
}

const clean = (s: string | null | undefined): string =>
  (s ?? '').normalize('NFKC').trim().toLowerCase();

/** The words to look for: the admin's list plus this person's own data. */
export function contextWords(
  adminWords: readonly string[],
  ctx: PasswordContext = {},
): string[] {
  const out = new Set<string>();
  const add = (w: string) => {
    const v = clean(w);
    // Words of one or two characters would match almost anything.
    if (v.length >= 3) out.add(v);
  };
  for (const w of adminWords) {
    add(w);
    add(w.replace(/\s+/g, ''));
  }
  const first = clean(ctx.firstName);
  const last = clean(ctx.lastName);
  add(first);
  add(last);
  if (first && last) add(`${first}${last}`);
  add(ctx.username ?? '');
  const local = clean(ctx.email).split('@')[0] ?? '';
  add(local);
  for (const part of local.split(/[._+-]+/)) add(part);
  const digits = (ctx.phone ?? '').replace(/\D/g, '');
  if (digits.length >= 7) {
    add(digits);
    add(digits.slice(-10));
    add(digits.slice(-7));
  }
  return [...out];
}

/** Share (0..1) of the password made of [words] (zxcvbn `userInputs`). */
export function contextCoverage(password: string, words: string[]): number {
  const pw = password.normalize('NFKC');
  if (pw.length === 0 || words.length === 0) return 0;
  const result = zxcvbn().check(pw, words);
  let covered = 0;
  for (const m of result.sequence) {
    // `dictionary` (one word, also reversed / l33t) and `wordSequence`
    // ("john.smith") matches both name the dictionary they came from.
    const match = m as { dictionaryName?: string; token?: string };
    if (match.dictionaryName === 'userInputs') {
      covered += (match.token ?? '').length;
    }
  }
  return covered / pw.length;
}

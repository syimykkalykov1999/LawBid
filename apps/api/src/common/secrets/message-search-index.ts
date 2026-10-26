import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { readKey } from './key-holder';
import { MessageBodyCipher } from './message-body-cipher';

/** Words longer than this are not indexed (links, base64 junk). */
export const SEARCH_WORD_MAX_CHARS = 64;
/** Distinct words indexed per message (a 2 000-char message has ~350). */
export const SEARCH_WORDS_PER_MESSAGE = 400;
/** Prefix tokens: from 3 characters up to this length. */
export const SEARCH_PREFIX_MIN = 3;
export const SEARCH_PREFIX_MAX = 12;
/** Words of a query that count (like `typedWords`). */
export const SEARCH_QUERY_WORDS = 6;
/** Stored token length: HMAC-SHA256 truncated to 128 bits. */
export const SEARCH_TOKEN_BYTES = 16;

/** The message types whose text is searchable (an attachment's caption). */
export const SEARCHABLE_MESSAGE_TYPES: readonly string[] = [
  'text',
  'attachment',
];

/**
 * The words of [text] as the search index sees them: Unicode NFKC,
 * lower case, accents removed and ё = е (the same folding as the old
 * `f_unaccent(lower(…))` LIKE search), punctuation and symbols as spaces,
 * split on whitespace, exact words (no stemming), each once, in order.
 */
export function searchWords(
  text: string,
  max = SEARCH_WORDS_PER_MESSAGE,
): string[] {
  const folded = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\p{P}\p{S}\p{C}]+/gu, ' ');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const w of folded.split(/\s+/)) {
    if (!w || seen.has(w) || [...w].length > SEARCH_WORD_MAX_CHARS) continue;
    seen.add(w);
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

/** The 3..12-character prefixes of [word] that are shorter than it. */
export function wordPrefixes(word: string): string[] {
  const chars = [...word];
  const out: string[] = [];
  for (
    let n = SEARCH_PREFIX_MIN;
    n < chars.length && n <= SEARCH_PREFIX_MAX;
    n += 1
  ) {
    out.push(chars.slice(0, n).join(''));
  }
  return out;
}

/** One stored row of `message_search_tokens`. */
export interface SearchTokenRow {
  conversation_id: string;
  message_id: string;
  token: Buffer<ArrayBuffer>;
}

/** A query as tokens: every word (`word` = its index) must match. */
export interface SearchQueryTokens {
  /** Hex of each token (bytea in SQL via decode(…, 'hex')). */
  hex: string[];
  /** The query word each token stands for (0-based). */
  word: number[];
  /** How many words must all match. */
  words: number;
}

/**
 * BUG-1 (2026-10-25, package N-12b): chat text search over sealed bodies.
 * `messages.body_display` is AES-GCM ciphertext (MessageBodyCipher), so a
 * LIKE over it never matches. This is the "blind index" of searchable
 * encryption (CipherStash exact index, CipherSweet blind indexes): every
 * word of a message is stored as HMAC-SHA256(SEARCH_INDEX_KEY, word)
 * truncated to 128 bits in `message_search_tokens`; a query hashes its
 * words the same way and asks for messages holding ALL of them. The
 * database never sees a word, and without the key nobody can compute a
 * token for a guessed word (unlike a plain hash). What it reveals is
 * equality only (two messages of a chat share a word) — the known,
 * accepted leak of every blind index.
 *
 * Exact words by default; `chat.search.prefix_tokens` (default off) also
 * stores 3..12-character prefixes, so «докум» finds «документ» — about 4×
 * the rows, which is why it is a switch. Domain separation: a word token
 * is HMAC("w\0" + word), a prefix token HMAC("p\0" + prefix), so a prefix
 * never equals a whole word's token.
 *
 * Active only when chat bodies are sealed (MESSAGE_ENC_KEYS) AND the key
 * is set; otherwise the chat keeps its LIKE search (local dev, plaintext).
 * Rotating the key: set the new one; the backfill job notices the changed
 * fingerprint and re-tokenizes every message.
 */
@Injectable()
export class MessageSearchIndex {
  private readonly logger = new Logger(MessageSearchIndex.name);
  private readonly key: Buffer | null;

  constructor(
    config: ConfigService,
    @Optional() private readonly cipher?: MessageBodyCipher,
    @Optional() private readonly settings?: AppSettingsService,
  ) {
    const raw = readKey('SEARCH_INDEX_KEY', () =>
      config.get<string>('SEARCH_INDEX_KEY'),
    );
    this.key = raw && raw.length >= 32 ? Buffer.from(raw, 'utf8') : null;
    const env = config.get<string>('NODE_ENV') ?? '';
    if (!this.key && this.cipher?.enabled && env === 'production') {
      this.logger.warn(
        'SEARCH_INDEX_KEY is not set: chat search finds names and case titles, not message text (docs/runbooks/DEPLOY_PROD.md «Поиск по тексту сообщений»)',
      );
    }
  }

  /** Bodies are sealed, so a LIKE over them cannot match. */
  get sealed(): boolean {
    return this.cipher?.enabled === true;
  }

  /** Tokens are written and read (sealed bodies + a key). */
  get enabled(): boolean {
    return this.sealed && this.key !== null;
  }

  /** Identifies the key (changes with it), reveals nothing about it. */
  fingerprint(): string | null {
    if (!this.key) return null;
    return createHmac('sha256', this.key)
      .update('fingerprint')
      .digest('hex')
      .slice(0, 16);
  }

  /** Admin switch `chat.search.prefix_tokens` (default off). */
  async prefixMode(): Promise<boolean> {
    if (!this.settings) return false;
    try {
      return await this.settings.boolean('chat.search.prefix_tokens');
    } catch {
      return false;
    }
  }

  private mac(kind: 'w' | 'p', value: string): Buffer<ArrayBuffer> {
    // Buffer.from copies the 16 bytes into their own ArrayBuffer (the
    // type Prisma's Bytes column takes).
    return Buffer.from(
      createHmac('sha256', this.key!)
        .update(`${kind}\0${value}`)
        .digest()
        .subarray(0, SEARCH_TOKEN_BYTES),
    );
  }

  /** Every token stored for [text] (deduplicated); [] when disabled. */
  tokensFor(text: string, prefixes: boolean): Buffer<ArrayBuffer>[] {
    if (!this.enabled) return [];
    const seen = new Set<string>();
    const out: Buffer<ArrayBuffer>[] = [];
    const add = (t: Buffer<ArrayBuffer>) => {
      const k = t.toString('hex');
      if (seen.has(k)) return;
      seen.add(k);
      out.push(t);
    };
    for (const w of searchWords(text)) {
      add(this.mac('w', w));
      if (prefixes) for (const p of wordPrefixes(w)) add(this.mac('p', p));
    }
    return out;
  }

  /** The rows to insert for one message ([] when its type has no text). */
  rowsFor(
    m: { id: string; conversation_id: string; type: string },
    text: string,
    prefixes: boolean,
  ): SearchTokenRow[] {
    if (!SEARCHABLE_MESSAGE_TYPES.includes(m.type)) return [];
    return this.tokensFor(text, prefixes).map((token) => ({
      conversation_id: m.conversation_id,
      message_id: m.id,
      token,
    }));
  }

  /**
   * A typed query as tokens. Each word matches as a whole word and — in
   * prefix mode, for 3..12 characters — as the start of a longer word.
   */
  queryTokens(q: string, prefixes: boolean): SearchQueryTokens {
    const words = this.enabled ? searchWords(q, SEARCH_QUERY_WORDS) : [];
    const hex: string[] = [];
    const word: number[] = [];
    words.forEach((w, i) => {
      hex.push(this.mac('w', w).toString('hex'));
      word.push(i);
      const n = [...w].length;
      if (prefixes && n >= SEARCH_PREFIX_MIN && n <= SEARCH_PREFIX_MAX) {
        hex.push(this.mac('p', w).toString('hex'));
        word.push(i);
      }
    });
    return { hex, word, words: words.length };
  }
}

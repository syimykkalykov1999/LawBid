import type { ConfigService } from '@nestjs/config';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import { MessageBodyCipher } from './message-body-cipher';
import {
  MessageSearchIndex,
  SEARCH_STOP_WORDS,
  SEARCH_TOKEN_BYTES,
  SEARCH_TOKENS_PER_MESSAGE,
  searchWords,
  wordPrefixes,
} from './message-search-index';

const KEY = 'k'.repeat(16) + 'Zq8!vR2#mW5$xT9%';
const ENC = `m1:${'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'}`;

function config(env: Record<string, string | undefined>): ConfigService {
  return { get: (k: string) => env[k] } as unknown as ConfigService;
}

function build(opts: { key?: string; sealed?: boolean; prefix?: boolean }) {
  const env = {
    SEARCH_INDEX_KEY: opts.key,
    MESSAGE_ENC_KEYS: opts.sealed === false ? undefined : ENC,
    MESSAGE_ENC_ACTIVE_KID: opts.sealed === false ? undefined : 'm1',
  };
  const cipher = new MessageBodyCipher(config(env));
  const settings = {
    boolean: jest.fn().mockResolvedValue(opts.prefix ?? false),
  } as unknown as AppSettingsService;
  return new MessageSearchIndex(config(env), cipher, settings);
}

describe('searchWords (tokenizer normalization)', () => {
  it('lowercases, folds accents and ё, strips punctuation, keeps each word once', () => {
    expect(searchWords('Ёлка, ЁЛКА! Café — «Invoice» #42 @bob')).toEqual([
      'елка',
      'cafe',
      'invoice',
      '42',
      'bob',
    ]);
  });

  it('applies NFKC (full-width and ligatures become plain letters)', () => {
    expect(searchWords('ＡＢＣ ﬁle')).toEqual(['abc', 'file']);
  });

  it('splits on any whitespace and drops empty / over-long words', () => {
    expect(searchWords(`ab\tbc\ncd  ${'x'.repeat(65)}`)).toEqual([
      'ab',
      'bc',
      'cd',
    ]);
    expect(searchWords('   ')).toEqual([]);
  });

  it('caps the number of words', () => {
    const many = Array.from({ length: 10 }, (_, i) => `w${i}`).join(' ');
    expect(searchWords(many, 3)).toEqual(['w0', 'w1', 'w2']);
  });
});

describe('searchWords (R-24: fewer, useful words)', () => {
  it('drops words under 2 characters and stop-words of every app locale', () => {
    expect(
      searchWords(
        'Я и адвокат в суде: the contract of a client, el contrato 5',
      ),
    ).toEqual(['адвокат', 'суде', 'contract', 'client', 'contrato']);
  });

  it('stop-word lists are already folded (lower case, no accents, е for ё)', () => {
    for (const list of Object.values(SEARCH_STOP_WORDS)) {
      for (const w of list) expect(searchWords(`${w} keep`)).toEqual(['keep']);
    }
  });
});

describe('wordPrefixes', () => {
  it('gives 3..12-character prefixes shorter than the word', () => {
    expect(wordPrefixes('docs')).toEqual(['doc']);
    expect(wordPrefixes('ab')).toEqual([]);
    expect(wordPrefixes('документация')).toEqual([
      'док',
      'доку',
      'докум',
      'докуме',
      'докумен',
      'документ',
      'документа',
      'документац',
      'документаци',
    ]);
    expect(wordPrefixes('a'.repeat(30))).toHaveLength(10);
  });
});

describe('MessageSearchIndex', () => {
  it('is enabled only with sealed bodies AND a key', () => {
    expect(build({ key: KEY }).enabled).toBe(true);
    expect(build({}).enabled).toBe(false);
    expect(build({}).sealed).toBe(true);
    expect(build({ key: KEY, sealed: false }).enabled).toBe(false);
    expect(build({ key: 'short' }).enabled).toBe(false);
  });

  it('makes 16-byte keyed tokens: same word → same token, other key → other token', () => {
    const a = build({ key: KEY });
    const b = build({ key: `${KEY}x` });
    const [t1] = a.tokensFor('Invoice', false);
    const [t2] = a.tokensFor('invoice!', false);
    const [t3] = b.tokensFor('invoice', false);
    expect(t1).toHaveLength(SEARCH_TOKEN_BYTES);
    expect(t1.equals(t2)).toBe(true);
    expect(t1.equals(t3)).toBe(false);
    // The word itself appears nowhere in the token.
    expect(t1.toString('utf8')).not.toContain('invoice');
  });

  it('writes nothing when disabled and for message types without text', () => {
    expect(build({}).tokensFor('hello', false)).toEqual([]);
    const idx = build({ key: KEY });
    const m = { id: 'm1', conversation_id: 'c1' };
    expect(idx.rowsFor({ ...m, type: 'voice' }, 'hello', false)).toEqual([]);
    const rows = idx.rowsFor(
      { ...m, type: 'text' },
      'hello hello world',
      false,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ conversation_id: 'c1', message_id: 'm1' });
    expect(
      idx.rowsFor({ ...m, type: 'attachment' }, 'caption', false),
    ).toHaveLength(1);
  });

  it('prefix mode adds prefix tokens that never equal a whole-word token', () => {
    const idx = build({ key: KEY });
    const exact = idx.tokensFor('document', false);
    const withPrefixes = idx.tokensFor('document', true);
    expect(exact).toHaveLength(1);
    // doc, docu, docum, docume, documen + the word
    expect(withPrefixes).toHaveLength(6);
    // "doc" typed as a whole word ≠ the prefix "doc" of "document".
    const [docWord] = idx.tokensFor('doc', false);
    expect(withPrefixes.slice(1).some((t) => t.equals(docWord))).toBe(false);
  });

  it('a query maps each word to its tokens (whole word, + prefix in prefix mode)', () => {
    const idx = build({ key: KEY });
    const q = idx.queryTokens('Docum invoice', false);
    expect(q.words).toBe(2);
    expect(q.word).toEqual([0, 1]);
    const [stored] = idx.tokensFor('invoice', false);
    expect(q.hex[1]).toBe(stored.toString('hex'));

    const p = idx.queryTokens('Docum invoice', true);
    expect(p.word).toEqual([0, 0, 1, 1]);
    // The query's prefix token for "docum" is a stored prefix of "document".
    const storedPrefixes = idx
      .tokensFor('document', true)
      .map((t) => t.toString('hex'));
    expect(storedPrefixes).toContain(p.hex[1]);
    expect(build({}).queryTokens('invoice', false).words).toBe(0);
  });

  it('reads the prefix switch from the admin settings (off on error)', async () => {
    expect(await build({ key: KEY, prefix: true }).prefixMode()).toBe(true);
    const broken = new MessageSearchIndex(
      config({ SEARCH_INDEX_KEY: KEY }),
      undefined,
      {
        boolean: jest.fn().mockRejectedValue(new Error('down')),
      } as unknown as AppSettingsService,
    );
    expect(await broken.prefixMode()).toBe(false);
  });

  it('caps token rows per message (words first, then prefixes)', () => {
    const idx = build({ key: KEY });
    const text = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    expect(idx.maxTokens).toBe(SEARCH_TOKENS_PER_MESSAGE);
    expect(idx.tokensFor(text, false)).toHaveLength(SEARCH_TOKENS_PER_MESSAGE);
    expect(idx.tokensFor(text, true, 10)).toHaveLength(10);
    // prefixes only after every kept word has its whole-word token
    const two = idx.tokensFor('документ договор', true, 3);
    expect(two[0].equals(idx.tokensFor('документ', false)[0])).toBe(true);
    expect(two[1].equals(idx.tokensFor('договор', false)[0])).toBe(true);
    expect(two).toHaveLength(3);
  });

  it('reads the cap setting and caches both settings for 30 s', async () => {
    const env = {
      SEARCH_INDEX_KEY: KEY,
      MESSAGE_ENC_KEYS: ENC,
      MESSAGE_ENC_ACTIVE_KID: 'm1',
    };
    const settings = {
      boolean: jest.fn().mockResolvedValue(false),
      number: jest.fn().mockResolvedValue(5),
    };
    const idx = new MessageSearchIndex(
      config(env),
      new MessageBodyCipher(config(env)),
      settings as unknown as AppSettingsService,
    );
    await idx.prefixMode();
    await idx.prefixMode();
    expect(settings.boolean).toHaveBeenCalledTimes(1);
    expect(settings.number).toHaveBeenCalledWith(
      'chat.search.max_tokens_per_message',
    );
    expect(idx.maxTokens).toBe(5);
    expect(
      idx.tokensFor('one two three four five six seven', false),
    ).toHaveLength(5);
  });

  it('fingerprint changes with the key and does not contain it', () => {
    const a = build({ key: KEY }).fingerprint();
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(build({ key: `${KEY}x` }).fingerprint()).not.toBe(a);
    expect(build({}).fingerprint()).toBeNull();
  });
});

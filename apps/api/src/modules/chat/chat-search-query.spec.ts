import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { MessageSearchIndex } from '../../common/secrets/message-search-index';
import { ChatService } from './chat.service';

/** BUG-1 (package N-12b): which SQL decides "this message holds the words". */
describe('ChatService chat search — message text match', () => {
  const sealedEnv: Record<string, string | undefined> = {
    SEARCH_INDEX_KEY: 'Zq8vR2mW5xT9pL4nB7cK1fH6jD3sG0aY',
    MESSAGE_ENC_KEYS: 'm1:a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8',
    MESSAGE_ENC_ACTIVE_KID: 'm1',
  };

  function build(env: Record<string, string | undefined>, prefix = false) {
    const config = { get: (k: string) => env[k] } as unknown as ConfigService;
    const cipher = new MessageBodyCipher(config);
    const settings = {
      boolean: jest.fn().mockResolvedValue(prefix),
    } as unknown as AppSettingsService;
    const index = new MessageSearchIndex(config, cipher, settings);
    const svc = new (
      ChatService as unknown as new (...a: unknown[]) => ChatService
    )(
      {},
      ...Array(10).fill(undefined),
      cipher,
      ...Array(5).fill(undefined),
      index,
    );
    const match = (q: string) =>
      (
        svc as unknown as {
          messageTextMatch: (q: string, w: string[]) => Promise<Prisma.Sql>;
        }
      ).messageTextMatch(q, q.toLowerCase().split(/\s+/));
    return { match, index };
  }

  it('sealed bodies: every word must match (intersection over the token table)', async () => {
    const { match, index } = build(sealedEnv);
    const sql = await match('Invoice Friday');
    expect(sql.sql).toContain('message_search_tokens');
    expect(sql.sql).toContain('st.conversation_id = c.id');
    expect(sql.sql).toContain('HAVING COUNT(DISTINCT qt.w) = ?');
    expect(sql.sql).not.toContain('LIKE');
    const [hex, words, n] = sql.values as [string[], number[], number];
    expect(n).toBe(2);
    expect(words).toEqual([0, 1]);
    expect(hex[0]).toBe(index.tokensFor('invoice', false)[0].toString('hex'));
    // No plaintext word reaches the database.
    expect(JSON.stringify(sql.values)).not.toMatch(/invoice|friday/i);
  });

  it('prefix mode sends a whole-word and a prefix token per word', async () => {
    const { match } = build(sealedEnv, true);
    const sql = await match('docum');
    const [hex, words, n] = sql.values as [string[], number[], number];
    expect(hex).toHaveLength(2);
    expect(words).toEqual([0, 0]);
    expect(n).toBe(1);
  });

  it('sealed bodies without SEARCH_INDEX_KEY: no text match (names still work)', async () => {
    const { match } = build({ ...sealedEnv, SEARCH_INDEX_KEY: undefined });
    expect((await match('invoice')).sql).toBe('FALSE');
  });

  it('plain bodies (local dev, no MESSAGE_ENC_KEYS): the old LIKE search', async () => {
    const { match } = build({ SEARCH_INDEX_KEY: sealedEnv.SEARCH_INDEX_KEY });
    const sql = await match('invoice');
    expect(sql.sql).toContain('LIKE');
    expect(sql.sql).not.toContain('message_search_tokens');
  });
});

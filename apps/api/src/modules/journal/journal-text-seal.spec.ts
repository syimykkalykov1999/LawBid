import { ConfigService } from '@nestjs/config';
import { MessageBodyCipher } from '../../common/secrets/message-body-cipher';
import { openJournalPayload, sealJournalPayload } from './journal-text-seal';
import { computeRowHash } from './case-journal.service';

const KEYS = 'k1:0123456789abcdef0123456789abcdef';
const on = { boolean: jest.fn().mockResolvedValue(true) };
const cipher = new MessageBodyCipher(
  new ConfigService({ MESSAGE_ENC_KEYS: KEYS, MESSAGE_ENC_ACTIVE_KID: 'k1' }),
  on as never,
);
const ID = '33333333-3333-4333-8333-333333333333';

describe('case-journal free-text sealing (S3-5)', () => {
  it('seals title / description diffs and notes, leaves ids and codes readable', async () => {
    const payload = {
      bidId: 'b1',
      reason: 'account_deleted',
      title: 'Divorce of Ivanov',
      description: { old: 'old text', new: 'new text' },
      note: 'call him',
    };
    const sealed = await sealJournalPayload(payload, ID, cipher);
    expect(sealed.bidId).toBe('b1');
    expect(sealed.reason).toBe('account_deleted');
    expect(JSON.stringify(sealed)).not.toContain('Ivanov');
    expect(JSON.stringify(sealed)).not.toContain('new text');
    expect(String(sealed.title).startsWith('encf:')).toBe(true);
    expect(openJournalPayload(sealed, ID, cipher)).toEqual(payload);
    // Bound to its row: another journal id opens nothing.
    const wrong = openJournalPayload(sealed, 'other', cipher) as {
      title: string;
    };
    expect(wrong.title).toBe('');
  });

  it('is a no-op while the switch is off or without keys, and old rows read unchanged', async () => {
    const off = new MessageBodyCipher(
      new ConfigService({
        MESSAGE_ENC_KEYS: KEYS,
        MESSAGE_ENC_ACTIVE_KID: 'k1',
      }),
      { boolean: jest.fn().mockResolvedValue(false) } as never,
    );
    const p = { title: 'Plain' };
    expect(await sealJournalPayload(p, ID, off)).toEqual(p);
    expect(await sealJournalPayload(p, ID, undefined)).toBe(p);
    expect(openJournalPayload(p, ID, cipher)).toEqual(p);
  });

  it('the hash chain covers the sealed form, so verifying needs no key', async () => {
    const sealed = await sealJournalPayload({ title: 'Secret' }, ID, cipher);
    const row = {
      id: ID,
      case_id: 'c',
      client_id: 'u',
      attorney_id: null,
      actor_user_id: null,
      actor_role: null,
      event_type: 'case_created' as never,
      payload: sealed,
      prev_hash: null,
      retain_until: new Date('2031-01-01T00:00:00Z'),
      created_at: new Date('2026-01-01T00:00:00Z'),
    };
    const h = computeRowHash(row);
    expect(computeRowHash({ ...row })).toBe(h);
    expect(computeRowHash({ ...row, payload: { title: 'Other' } })).not.toBe(h);
  });
});

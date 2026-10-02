import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  afterAdminReply,
  afterUserMessage,
  supportAuthorName,
  withResolvedAt,
} from './support.rules';

const NOW = new Date('2026-10-02T12:00:00Z');
const EARLIER = new Date('2026-10-01T12:00:00Z');

describe('support ticket state rules', () => {
  it.each(['open', 'waiting_user', 'resolved'])(
    'a user message moves %s → open and clears resolved_at',
    (status) => {
      expect(afterUserMessage(status, EARLIER, NOW)).toEqual({
        status: 'open',
        resolvedAt: null,
      });
    },
  );

  it('a user message to a closed ticket is a 409 SUPPORT_TICKET_CLOSED', () => {
    try {
      afterUserMessage('closed', EARLIER, NOW);
      throw new Error('expected a throw');
    } catch (e) {
      expect((e as { getStatus(): number }).getStatus()).toBe(409);
      expect(
        (e as { getResponse(): { code: string } }).getResponse().code,
      ).toBe(ErrorCode.SUPPORT_TICKET_CLOSED);
    }
  });

  it('a public admin reply defaults to waiting_user', () => {
    expect(afterAdminReply(undefined, null, NOW)).toEqual({
      status: 'waiting_user',
      resolvedAt: null,
    });
  });

  it('an admin reply can resolve directly (stamps resolved_at once)', () => {
    expect(afterAdminReply('resolved', null, NOW)).toEqual({
      status: 'resolved',
      resolvedAt: NOW,
    });
    expect(withResolvedAt('closed', EARLIER, NOW)).toEqual({
      status: 'closed',
      resolvedAt: EARLIER,
    });
  });

  it('support is shown as "LawBid Support" + optional first name', () => {
    expect(supportAuthorName(null)).toBe('LawBid Support');
    expect(supportAuthorName('  ')).toBe('LawBid Support');
    expect(supportAuthorName('Anna')).toBe('LawBid Support · Anna');
  });
});

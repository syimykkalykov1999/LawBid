import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  afterAdminReply,
  afterUserMessage,
  assertHasContent,
  buildClientContext,
  pickMacroBody,
  renderMacro,
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

describe('ready answers: variables and language', () => {
  const v = {
    firstName: 'Anna',
    ticketId: '3333aaaa-3333-4333-8333-333333333333',
    language: 'en',
  };

  it('fills {name} and {ticket} (any case, every occurrence)', () => {
    expect(renderMacro('Hi {name} / {Name}: {ticket}, {TICKET}', v)).toBe(
      'Hi Anna / Anna: #3333AAAA, #3333AAAA',
    );
  });

  it('leaves other braces alone and does not interpret $ in a name', () => {
    expect(renderMacro('{x} {name}', { ...v, firstName: '$&' })).toBe('{x} $&');
  });

  it('no first name: "there" in English, tidy nothing in Russian', () => {
    expect(renderMacro('Hello, {name}!', { ...v, firstName: ' ' })).toBe(
      'Hello, there!',
    );
    expect(
      renderMacro('Здравствуйте, {name}! Ваш номер {ticket}.', {
        ...v,
        firstName: null,
        language: 'ru',
      }),
    ).toBe('Здравствуйте! Ваш номер #3333AAAA.');
  });

  it('picks the Russian body for ru users, English otherwise or when missing', () => {
    const m = { body: 'Hello', body_ru: 'Привет' };
    expect(pickMacroBody(m, 'ru')).toBe('Привет');
    expect(pickMacroBody(m, 'ru-RU')).toBe('Привет');
    expect(pickMacroBody(m, 'en')).toBe('Hello');
    expect(pickMacroBody(m, 'de')).toBe('Hello');
    expect(pickMacroBody(m, undefined)).toBe('Hello');
    expect(pickMacroBody({ body: 'Hello', body_ru: null }, 'ru')).toBe('Hello');
    expect(pickMacroBody({ body: 'Hello', body_ru: '  ' }, 'ru')).toBe('Hello');
  });
});

describe('message content and device context', () => {
  it('a message needs words or a file', () => {
    expect(() => assertHasContent('  ', [])).toThrow();
    expect(() => assertHasContent('', undefined)).toThrow();
    expect(() => assertHasContent('hi', undefined)).not.toThrow();
    expect(() => assertHasContent('', [{}])).not.toThrow();
  });

  it('context keeps known fields, adds the session user, drops blanks', () => {
    expect(
      buildClientContext(undefined, { id: 'u', role: 'client' }),
    ).toBeNull();
    expect(
      buildClientContext(
        { appVersion: ' 1.2.3 ', platform: 'ios', deviceModel: '' },
        { id: 'u1', role: 'attorney' },
      ),
    ).toEqual({
      appVersion: '1.2.3',
      platform: 'ios',
      userId: 'u1',
      role: 'attorney',
    });
  });
});

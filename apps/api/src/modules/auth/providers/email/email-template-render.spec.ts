import {
  missingRequiredVars,
  normalizeEmailLocale,
  renderEmailTemplate,
  renderTemplateString,
  templateVariables,
} from './email-template-render';

describe('email template rendering', () => {
  it('replaces {{var}} (spaces allowed), unknown vars → empty', () => {
    expect(
      renderTemplateString('Code {{ code }} for {{who}}!', { code: '42' }),
    ).toBe('Code 42 for !');
  });

  it('HTML-escapes values in a raw HTML body but not in text', () => {
    const out = renderEmailTemplate(
      {
        subject: 'Hi {{name}}',
        textBody: 'Hello {{name}}',
        htmlBody: '<p>Hello {{name}}</p>',
      },
      { name: '<script>alert("x")</script>' },
    );
    expect(out.text).toBe('Hello <script>alert("x")</script>');
    expect(out.html).toBe(
      '<p>Hello &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>',
    );
  });

  it('keeps the subject on one line', () => {
    const out = renderEmailTemplate(
      { subject: 'A {{v}}', textBody: 'x' },
      { v: 'b\r\nBcc: evil@example.com' },
    );
    expect(out.subject).toBe('A b Bcc: evil@example.com');
    expect(out.subject).not.toMatch(/[\r\n]/);
  });

  it('empty html body → the text in the branded layout, escaped, links clickable', () => {
    const out = renderEmailTemplate(
      {
        subject: 's',
        textBody: 'Code: {{code}}\n\nOpen {{link}} <b>now</b>',
      },
      { code: '123456', link: 'https://lawbid.app/x?a=1&b=2' },
    );
    expect(out.html).toContain('#0B0B0D');
    expect(out.html).toContain('#C9A24A');
    expect(out.html).toContain('LawBid');
    expect(out.html).toContain('123456');
    expect(out.html).toContain('&lt;b&gt;now&lt;/b&gt;');
    expect(out.html).toContain('<a href="https://lawbid.app/x?a=1&amp;b=2"');
  });

  it('a non-HTML html body is rendered as text inside the layout', () => {
    const out = renderEmailTemplate(
      { subject: 's', textBody: 't', htmlBody: 'Hello **{{name}}**' },
      { name: '<i>' },
    );
    expect(out.html.startsWith('<!doctype html>')).toBe(true);
    expect(out.html).toContain('Hello **&lt;i&gt;**');
  });

  it('lists variables and missing required ones', () => {
    expect(templateVariables('{{a}} {{ b }} {{a}}')).toEqual(['a', 'b']);
    expect(
      missingRequiredVars('login_otp', { subject: 's', textBody: 'no code' }),
    ).toEqual(['code']);
    expect(
      missingRequiredVars('login_otp', {
        subject: 's',
        textBody: '{{code}}',
        htmlBody: '<p>forgot it</p>',
      }),
    ).toEqual(['code']);
    expect(
      missingRequiredVars('login_otp', {
        subject: 's',
        textBody: '{{code}}',
        htmlBody: '<b>{{ code }}</b>',
      }),
    ).toEqual([]);
    expect(
      missingRequiredVars('new_device', { subject: 's', textBody: 'x' }),
    ).toEqual([]);
  });

  it('normalizes locales to en / ru', () => {
    expect(normalizeEmailLocale(undefined)).toBe('en');
    expect(normalizeEmailLocale('ru-RU')).toBe('ru');
    expect(normalizeEmailLocale('de')).toBe('en');
  });
});

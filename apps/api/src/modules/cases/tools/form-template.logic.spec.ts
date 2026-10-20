import { STARTER_TEMPLATES } from '../../../../prisma/seed-form-templates';
import {
  placeKeys,
  renderBody,
  templateErrors,
  valueErrors,
  type TemplateField,
} from './form-template.logic';

const field = (
  key: string,
  over: Partial<TemplateField> = {},
): TemplateField => ({
  key,
  type: 'text',
  required: true,
  label: { en: key },
  ...over,
});

describe('form template logic', () => {
  it('finds the places of a body once each, in order', () => {
    expect(placeKeys('A {{a}} B {{ b }} C {{a}} {{Bad}} {{c_1}}')).toEqual([
      'a',
      'b',
      'c_1',
    ]);
  });

  it('fills the places in one pass and leaves no braces from a value', () => {
    expect(renderBody('Hi {{name}}, {{x}}!', { name: '{{x}}', x: '$&' })).toBe(
      'Hi {{x}}, $&!',
    );
    expect(renderBody('Hi {{name}}.', {})).toBe('Hi .');
  });

  it('accepts a good template and names what is wrong with a bad one', () => {
    const good = {
      title: { en: 'T' },
      body: { en: 'Dear {{n}}', ru: 'Уважаемый {{n}}' },
      fields: [field('n')],
    };
    expect(templateErrors(good)).toEqual([]);
    expect(templateErrors({ ...good, body: { en: 'Dear {{zzz}}' } })).toEqual([
      'body.en uses {{zzz}} but there is no such field',
    ]);
    expect(
      templateErrors({ ...good, fields: [field('n'), field('n')] }),
    ).toContain('field "n" is listed twice');
    expect(templateErrors({ ...good, title: {} })).toContain(
      'title.en is required',
    );
    expect(templateErrors({ ...good, fields: [field('Bad Key')] })[0]).toMatch(
      /needs a key/,
    );
    expect(
      templateErrors({
        ...good,
        fields: [field('n', { type: 'file' as never })],
      }).join(' '),
    ).toMatch(/type must be one of/);
    expect(
      templateErrors({ title: 1, body: 2, fields: 3 }).length,
    ).toBeGreaterThan(2);
  });

  it('checks the answers by field type', () => {
    const fields = [
      field('a'),
      field('d', { type: 'date' }),
      field('n', { type: 'number', required: false }),
      field('t', { type: 'text', required: false }),
    ];
    expect(valueErrors(fields, { a: 'x', d: '2026-10-20', n: '12,5' })).toEqual(
      [],
    );
    expect(valueErrors(fields, { a: ' ', d: '20.10.2026', n: 'abc' })).toEqual([
      { key: 'a', problem: 'required' },
      { key: 'd', problem: 'invalid' },
      { key: 'n', problem: 'invalid' },
    ]);
    expect(
      valueErrors(fields, { a: 'x', d: '2026-10-20', t: 'y'.repeat(201) }),
    ).toEqual([{ key: 't', problem: 'too_long' }]);
  });

  it('ships starter templates that pass their own checks, in en and ru', () => {
    expect(STARTER_TEMPLATES.length).toBeGreaterThanOrEqual(3);
    for (const t of STARTER_TEMPLATES) {
      expect(templateErrors(t)).toEqual([]);
      expect(Object.keys(t.body).sort()).toEqual(['en', 'ru']);
      // the same places in both languages
      expect(placeKeys(t.body.ru).sort()).toEqual(placeKeys(t.body.en).sort());
      for (const f of t.fields) {
        expect(f.label.ru).toBeTruthy();
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { EMPTY_FORM, type FormState, formErrors, keyFromLabel, languagesOf, mismatch, placeKeys, serverErrors, toPayload } from './form-templates';

const field = (key: string, en = 'Label') => ({ key, type: 'text' as const, required: true, label: { en } });
const form = (over: Partial<FormState>): FormState => ({
  ...EMPTY_FORM,
  slug: 'power-of-attorney',
  title: { en: 'POA', ru: '' },
  body: { en: 'Dear {{client_name}}', ru: '' },
  fields: [field('client_name')],
  ...over,
});

describe('form templates', () => {
  it('finds {{places}} once each, with spaces allowed', () => {
    expect(placeKeys('{{a}} x {{ b }} {{a}} {{Bad}} {{1x}}')).toEqual(['a', 'b']);
  });

  it('compares places with fields per language', () => {
    const m = mismatch({ en: '{{a}}', ru: '{{a}} {{c}}' }, [field('a'), field('b')]);
    expect(m.missing).toEqual([{ lang: 'ru', key: 'c' }]);
    expect(m.unused).toEqual(['b']);
  });

  it('accepts a valid template and drops empty texts from the payload', () => {
    const f = form({});
    expect(formErrors(f, { isNew: true })).toEqual([]);
    const p = toPayload(f);
    expect(p.title).toEqual({ en: 'POA' });
    expect(p.body).toEqual({ en: 'Dear {{client_name}}' });
    expect(p.fields[0].prefill).toBeNull();
  });

  it('reports what the API would reject', () => {
    expect(formErrors(form({ slug: 'Bad Slug' }), { isNew: true })).toHaveLength(1);
    expect(formErrors(form({ slug: 'Bad Slug' }), { isNew: false })).toEqual([]);
    expect(formErrors(form({ title: { en: ' ' } }), { isNew: false })[0]).toMatch(/названи/);
    expect(formErrors(form({ fields: [field('a'), field('a')], body: { en: 'x' } }), { isNew: false }).join()).toMatch(/дважды/);
    expect(formErrors(form({ fields: [field('Bad-Key')] }), { isNew: false }).join()).toMatch(/ключ/);
    expect(formErrors(form({ fields: [field('client_name', ' ')] }), { isNew: false }).join()).toMatch(/подпись/);
    expect(formErrors(form({ body: { en: '{{ghost}}' } }), { isNew: false }).join()).toMatch(/ghost/);
  });

  it('lists languages with en and ru first', () => {
    expect(languagesOf(form({ body: { en: 'x', es: 'y' } }))).toEqual(['en', 'ru', 'es']);
  });

  it('reads the server error list and builds keys from labels', () => {
    expect(serverErrors({ errors: ['a', 1, 'b'] })).toEqual(['a', 'b']);
    expect(serverErrors(undefined)).toEqual([]);
    expect(keyFromLabel('Client name!')).toBe('client_name');
    expect(keyFromLabel('Имя')).toBe('');
  });
});

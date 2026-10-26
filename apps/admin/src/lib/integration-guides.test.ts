import { describe, expect, it } from 'vitest';
import { generated, GUIDES, rejectText } from './integration-guides';

describe('key guides (owner 2026-10-06)', () => {
  it('generates values the server accepts', () => {
    expect(generated('token')).toMatch(/^[\w-]{24,}$/);
    expect(generated('whsec')).toMatch(/^whsec_[A-Za-z0-9]{10,}$/);
    expect(generated('token')).not.toBe(generated('token'));
  });

  it('every guide has steps and a hint per field', () => {
    for (const g of Object.values(GUIDES)) {
      expect(g.steps.length).toBeGreaterThan(0);
      for (const f of Object.values(g.fields)) expect(f.how.length).toBeGreaterThan(0);
    }
  });

  it('names the field in plain Russian', () => {
    expect(rejectText('Секретный ключ', 'required')).toBe('Поле «Секретный ключ» не заполнено.');
    expect(rejectText('Секрет', 'format', 'whsec_…')).toContain('Должно выглядеть так: whsec_…');
  });
});

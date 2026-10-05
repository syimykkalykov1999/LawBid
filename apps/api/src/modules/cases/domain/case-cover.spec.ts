import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateCaseDto } from '../dto/case-requests.dto';
import { CASE_COVER_KEYS } from './case-cover';

describe('case cover / urgency (owner 2026-10-04)', () => {
  const errors = (body: object): string[] =>
    validateSync(plainToInstance(UpdateCaseDto, body)).map((e) => e.property);

  it('lists four practice variants and the icon avatars', () => {
    expect(CASE_COVER_KEYS.slice(0, 4)).toEqual([
      'art:0',
      'art:1',
      'art:2',
      'art:3',
    ]);
    expect(CASE_COVER_KEYS).toContain('icon:gavel');
    for (const k of CASE_COVER_KEYS) {
      expect(k).toMatch(/^(art:[0-3]|icon:[a-z_]{2,32})$/);
    }
  });

  it('accepts a known cover, an urgency and null (clear)', () => {
    expect(errors({ coverKey: 'art:3', urgency: 'urgent' })).toEqual([]);
    expect(errors({ coverKey: 'icon:family' })).toEqual([]);
    expect(errors({ coverKey: null, urgency: null })).toEqual([]);
  });

  it('rejects anything else, e.g. a photo URL', () => {
    expect(errors({ coverKey: 'https://x/me.jpg' })).toEqual(['coverKey']);
    expect(errors({ coverKey: 'art:4' })).toEqual(['coverKey']);
    expect(errors({ urgency: 'asap' })).toEqual(['urgency']);
  });
});

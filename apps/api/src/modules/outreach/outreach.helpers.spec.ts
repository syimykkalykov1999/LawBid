import { leadsFromCsv, parseCsv } from './lead-csv';
import { leadsFromRegistry } from './ny-registry.source';
import {
  advance,
  normalizeEmail,
  normalizePhone,
  normalizeState,
  parseOutreachSettings,
} from './outreach.settings';

describe('outreach: CSV import', () => {
  it('parses quoted fields, BOM and semicolons', () => {
    expect(parseCsv('﻿a;b\n"x;1";"he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x;1', 'he said "hi"'],
    ]);
  });

  it('maps English and Russian headers, normalizes contacts, skips empty', () => {
    const csv = [
      'Имя,Фамилия,Фирма,Штат,Телефон,Email,Практика',
      'Ivan,Petrov,Petrov Law,New York,(212) 555-0101,IVAN@Example.com,family',
      'No,Contact,,TX,,,',
      ',,Firm Only,ca,5125550102,,',
    ].join('\n');
    const r = leadsFromCsv(csv, 'attorney');
    expect(r.leads).toHaveLength(2);
    expect(r.leads[0]).toMatchObject({
      row: 2,
      firstName: 'Ivan',
      lastName: 'Petrov',
      company: 'Petrov Law',
      stateCode: 'NY',
      phone: '12125550101',
      email: 'ivan@example.com',
      practice: 'family',
      kind: 'attorney',
    });
    expect(r.leads[1]).toMatchObject({
      row: 4,
      stateCode: 'CA',
      phone: '15125550102',
      email: null,
    });
    expect(r.skipped).toEqual([{ row: 3, reason: expect.any(String) }]);
  });

  it('splits a full name column', () => {
    const r = leadsFromCsv('name,phone\nAnna Maria Lee,2125550199\n', 'client');
    expect(r.leads[0]).toMatchObject({
      firstName: 'Anna',
      lastName: 'Maria Lee',
      kind: 'client',
    });
  });

  it('refuses a file without a contact column', () => {
    expect(() => leadsFromCsv('name,city\nA,B\n', 'attorney')).toThrow(
      'no_contact_column',
    );
  });
});

describe('outreach: NY registry mapping', () => {
  it('keeps rows with a phone only, tagged NY attorney', () => {
    const leads = leadsFromRegistry([
      {
        registration_number: '1234567',
        first_name: 'JANE',
        last_name: 'DOE',
        company_name: 'DOE LLP',
        city: 'BROOKLYN',
        phone_number: '718-555-0100',
      },
      { first_name: 'NO', last_name: 'PHONE' },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      firstName: 'JANE',
      stateCode: 'NY',
      phone: '17185550100',
      kind: 'attorney',
      note: 'NY registration 1234567',
    });
  });
});

describe('outreach: normalizers and status ladder', () => {
  it('normalizes email, phone and state', () => {
    expect(normalizeEmail(' A@B.co ')).toBe('a@b.co');
    expect(normalizeEmail('nope')).toBeNull();
    expect(normalizePhone('+1 (212) 555-0100')).toBe('12125550100');
    expect(normalizePhone('2125550100')).toBe('12125550100');
    expect(normalizePhone('123')).toBeNull();
    expect(normalizeState('new york')).toBe('NY');
    expect(normalizeState('tx')).toBe('TX');
    expect(normalizeState('Narnia')).toBeNull();
  });

  it('only moves forward; system statuses stick; lost is reversible', () => {
    expect(advance('new', 'contacted')).toBe('contacted');
    expect(advance('contacted', 'working')).toBe('contacted');
    expect(advance('registered', 'lost')).toBe('registered');
    expect(advance('registered', 'paid')).toBe('paid');
    expect(advance('contacted', 'lost')).toBe('lost');
    expect(advance('lost', 'replied')).toBe('replied');
    expect(advance('working', null)).toBe('working');
  });

  it('clamps settings to safe bounds', () => {
    const s = parseOutreachSettings({
      dailyEmailLimit: 99_999,
      fromName: '  ',
      apiPublicUrl: 'https://api.lawbid.dev/',
    });
    expect(s.dailyEmailLimit).toBeLessThanOrEqual(1000);
    expect(s.fromName).toBe('LawBid');
    expect(s.apiPublicUrl).toBe('https://api.lawbid.dev');
  });
});

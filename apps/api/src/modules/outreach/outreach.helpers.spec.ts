import { maskSuppression } from './admin-outreach.service';
import { leadsFromCsv, parseCsv } from './lead-csv';
import { leadsFromRegistry } from './ny-registry.source';
import { blockMessage, contactState, leadRow } from './outreach.service';
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

describe('outreach: compliance (TCPA / DNC)', () => {
  const base = {
    dailyEmailLimit: 50,
    fromName: 'LawBid',
    footerAddress: '',
    apiPublicUrl: '',
  };

  it('parses the compliance settings with safe defaults', () => {
    const d = parseOutreachSettings({});
    expect(d).toMatchObject({
      clientLeadsEnabled: false,
      dncConfirmed: false,
      dncSan: '',
      callHoursStart: 8,
      callHoursEnd: 21,
      maxEmailsPerLead: 2,
      emailCooldownDays: 14,
      leadRetentionDays: 365,
    });
    // clientLeadsEnabled never survives without dncConfirmed.
    expect(
      parseOutreachSettings({ clientLeadsEnabled: true }).clientLeadsEnabled,
    ).toBe(false);
    expect(
      parseOutreachSettings({ clientLeadsEnabled: true, dncConfirmed: true })
        .clientLeadsEnabled,
    ).toBe(true);
    // An inverted window falls back to the default one.
    expect(
      parseOutreachSettings({ callHoursStart: 20, callHoursEnd: 9 }),
    ).toMatchObject({ callHoursStart: 8, callHoursEnd: 21 });
    expect(
      parseOutreachSettings({ leadRetentionDays: 10, maxEmailsPerLead: 99 }),
    ).toMatchObject({ leadRetentionDays: 365, maxEmailsPerLead: 2 });
  });

  const settings = parseOutreachSettings({ ...base });
  const lead = (p: Partial<Parameters<typeof contactState>[0]> = {}) => ({
    kind: 'attorney',
    state_code: 'NY',
    do_not_contact_at: null,
    unsubscribed_at: null,
    emails_sent: 0,
    last_email_at: null,
    ...p,
  });
  const noonEst = new Date('2026-01-15T17:00:00Z');
  const nightEst = new Date('2026-01-16T03:15:00Z'); // 22:15 EST

  it('blocks calls by do-not-contact, clients switched off, then local hours', () => {
    expect(contactState(lead(), settings, noonEst)).toMatchObject({
      callBlocked: null,
      emailBlocked: null,
      callWindow: '08:00–21:00 America/New_York, now 12:00',
    });
    expect(
      contactState(lead({ do_not_contact_at: noonEst }), settings, noonEst),
    ).toMatchObject({ callBlocked: 'dnc', emailBlocked: 'dnc' });
    expect(
      contactState(lead({ kind: 'client' }), settings, noonEst),
    ).toMatchObject({
      callBlocked: 'client_disabled',
      emailBlocked: 'client_disabled',
    });
    const on = parseOutreachSettings({
      ...base,
      clientLeadsEnabled: true,
      dncConfirmed: true,
    });
    expect(contactState(lead({ kind: 'client' }), on, noonEst)).toMatchObject({
      callBlocked: null,
      emailBlocked: null,
    });
    const night = contactState(lead(), settings, nightEst);
    expect(night).toMatchObject({ callBlocked: 'hours', emailBlocked: null });
    expect(blockMessage('hours', night, settings)).toBe(
      'Calls to this lead are not allowed now: local time 22:15, window 08:00–21:00 (America/New_York).',
    );
  });

  it('blocks emails by unsubscribe, the per-lead cap and the cooldown', () => {
    expect(
      contactState(lead({ unsubscribed_at: noonEst }), settings, noonEst)
        .emailBlocked,
    ).toBe('unsubscribed');
    expect(
      contactState(lead({ emails_sent: 2 }), settings, noonEst).emailBlocked,
    ).toBe('email_limit');
    expect(
      contactState(
        lead({
          emails_sent: 1,
          last_email_at: new Date('2026-01-10T00:00:00Z'),
        }),
        settings,
        noonEst,
      ).emailBlocked,
    ).toBe('email_cooldown');
    expect(
      contactState(
        lead({
          emails_sent: 1,
          last_email_at: new Date('2025-12-01T00:00:00Z'),
        }),
        settings,
        noonEst,
      ).emailBlocked,
    ).toBeNull();
    // 0 = no cap.
    const uncapped = parseOutreachSettings({ ...base, maxEmailsPerLead: 0 });
    expect(
      contactState(lead({ emails_sent: 9 }), uncapped, noonEst).emailBlocked,
    ).toBeNull();
  });

  it('hides phone and email of a do-not-contact lead in the row DTO', () => {
    const row = {
      id: 'l1',
      kind: 'attorney',
      first_name: 'A',
      last_name: 'B',
      company: null,
      state_code: 'NY',
      city: null,
      practice: null,
      phone: '12125550100',
      email: 'a@b.co',
      source: 'manual',
      source_ref: null,
      status: 'new',
      partner_id: null,
      converted_user_id: null,
      unsubscribe_token: 't',
      unsubscribed_at: null,
      last_activity_at: null,
      next_action_at: null,
      note: null,
      do_not_contact_at: null,
      do_not_contact_reason: null,
      source_note: 'Bar directory',
      emails_sent: 1,
      last_email_at: null,
      created_by: 'u',
      created_at: noonEst,
      updated_at: noonEst,
    };
    expect(leadRow(row, null)).toMatchObject({
      phone: '12125550100',
      email: 'a@b.co',
      doNotContact: false,
      sourceNote: 'Bar directory',
      emailsSent: 1,
    });
    expect(
      leadRow(
        { ...row, do_not_contact_at: noonEst, do_not_contact_reason: 'manual' },
        null,
      ),
    ).toMatchObject({
      phone: null,
      email: null,
      doNotContact: true,
      doNotContactReason: 'manual',
    });
  });

  it('masks stop-list entries except the last 4 characters', () => {
    expect(maskSuppression('12125550100')).toBe('•••••••0100');
    expect(maskSuppression('a@b.co')).toBe('••b.co');
  });
});

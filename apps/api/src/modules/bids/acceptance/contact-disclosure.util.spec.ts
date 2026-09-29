import { disclosedFieldsOf } from './contact-disclosure.util';

describe('disclosedFieldsOf (docs/04 §8.2, docs/02 §4.C)', () => {
  const full = {
    first_name: 'Anna',
    last_name: 'Kowalski',
    phone_e164: '+12015550123',
    email: 'anna@example.com',
    client_profile: {
      preferred_contact_method: 'sms' as const,
      preferred_contact_note: 'after 6pm',
    },
  };

  it('lists every §8.1 field the client has on file, in a stable order', () => {
    expect(disclosedFieldsOf(full)).toEqual([
      'name',
      'phone',
      'email',
      'preferred_contact',
    ]);
  });

  it('omits fields that are empty — nothing empty counts as disclosed', () => {
    expect(
      disclosedFieldsOf({
        ...full,
        first_name: null,
        last_name: null,
        email: null,
        client_profile: null,
      }),
    ).toEqual(['phone']);
  });

  it('counts a lone last name as a name and a lone note as a contact preference', () => {
    expect(
      disclosedFieldsOf({
        first_name: null,
        last_name: 'Kowalski',
        phone_e164: null,
        email: null,
        client_profile: {
          preferred_contact_method: null,
          preferred_contact_note: 'weekends only',
        },
      }),
    ).toEqual(['name', 'preferred_contact']);
  });

  it('returns an empty list for a client with nothing on file', () => {
    expect(
      disclosedFieldsOf({
        first_name: null,
        last_name: null,
        phone_e164: null,
        email: null,
        client_profile: null,
      }),
    ).toEqual([]);
  });
});

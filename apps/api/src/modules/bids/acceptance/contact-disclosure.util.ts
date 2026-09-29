import type { ContactMethod } from '@prisma/client';

/** docs/02 §4.C contact_disclosures.fields: `name`, `phone`, `email`,
 * `preferred_contact`. */
export type DisclosedField = 'name' | 'phone' | 'email' | 'preferred_contact';

/** What GET /cases/:id/contacts hands to the attorney (docs/04 §8.1): the
 * client's name, phone, email, preferred way and time to be contacted. */
export interface ClientContactSource {
  first_name: string | null;
  last_name: string | null;
  phone_e164: string | null;
  email: string | null;
  client_profile: {
    preferred_contact_method: ContactMethod | null;
    preferred_contact_note: string | null;
  } | null;
}

/**
 * Pure: which of the §8.1 fields the client actually has on file at the
 * moment of acceptance — that list is what the append-only
 * contact_disclosures row records (docs/04 §8.2 "какие поля"). A field
 * that is empty is not "disclosed", so it is not listed.
 */
export function disclosedFieldsOf(
  client: ClientContactSource,
): DisclosedField[] {
  const fields: DisclosedField[] = [];
  if (client.first_name || client.last_name) fields.push('name');
  if (client.phone_e164) fields.push('phone');
  if (client.email) fields.push('email');
  if (
    client.client_profile?.preferred_contact_method ||
    client.client_profile?.preferred_contact_note
  ) {
    fields.push('preferred_contact');
  }
  return fields;
}

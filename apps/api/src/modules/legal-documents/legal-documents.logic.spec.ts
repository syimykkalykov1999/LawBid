import {
  computePending,
  nextVersion,
  type LatestConsent,
  type PublishedDoc,
} from './legal-documents.logic';

const doc = (over: Partial<PublishedDoc>): PublishedDoc => ({
  id: 'd1',
  doc_type: 'eula',
  locale: 'en',
  version: '2026-10-01.1',
  published_at: new Date('2026-10-01T10:00:00Z'),
  is_current: true,
  requires_reacceptance: true,
  ...over,
});

const consent = (over: Partial<LatestConsent>): LatestConsent => ({
  consent_type: 'eula',
  granted: true,
  document: { id: 'd1', published_at: new Date('2026-10-01T10:00:00Z') },
  ...over,
});

describe('nextVersion', () => {
  const day = new Date('2026-10-05T12:00:00Z');

  it('starts at .1 and counts publications of the same day', () => {
    expect(nextVersion(day, [])).toBe('2026-10-05.1');
    expect(nextVersion(day, ['2026-10-05.1', '2026-10-04.7', '1.0'])).toBe(
      '2026-10-05.2',
    );
    expect(nextVersion(day, ['2026-10-05.9', '2026-10-05.10'])).toBe(
      '2026-10-05.11',
    );
  });
});

describe('computePending', () => {
  it('asks for a document that was never accepted', () => {
    const r = computePending({
      types: ['eula'],
      locale: 'en',
      docs: [doc({})],
      consents: [],
    });
    expect(r.map((p) => [p.doc.id, p.reason])).toEqual([['d1', 'new']]);
  });

  it('asks nothing for a type without a published version', () => {
    expect(
      computePending({ types: ['eula'], locale: 'en', docs: [], consents: [] }),
    ).toEqual([]);
  });

  it('is satisfied by the current version, and a withdrawn consent is not', () => {
    const base = { types: ['eula' as const], locale: 'en', docs: [doc({})] };
    expect(computePending({ ...base, consents: [consent({})] })).toEqual([]);
    expect(
      computePending({ ...base, consents: [consent({ granted: false })] }),
    ).toHaveLength(1);
  });

  it('asks again after a material change but not after a small fix', () => {
    const old = doc({ id: 'old', is_current: false });
    const accepted = consent({
      document: { id: 'old', published_at: old.published_at },
    });
    const material = doc({
      id: 'new',
      version: '2026-10-05.1',
      published_at: new Date('2026-10-05T10:00:00Z'),
    });
    const r = computePending({
      types: ['eula'],
      locale: 'en',
      docs: [old, material],
      consents: [accepted],
    });
    expect(r.map((p) => [p.doc.id, p.reason])).toEqual([['new', 'updated']]);

    const fix = { ...material, requires_reacceptance: false };
    expect(
      computePending({
        types: ['eula'],
        locale: 'en',
        docs: [old, fix],
        consents: [accepted],
      }),
    ).toEqual([]);
  });

  it('asks when any version since the accepted one was material, even if the latest is a small fix', () => {
    const old = doc({ id: 'old', is_current: false });
    const mid = doc({
      id: 'mid',
      is_current: false,
      published_at: new Date('2026-10-03T10:00:00Z'),
      requires_reacceptance: true,
    });
    const fix = doc({
      id: 'cur',
      published_at: new Date('2026-10-05T10:00:00Z'),
      requires_reacceptance: false,
    });
    const r = computePending({
      types: ['eula'],
      locale: 'en',
      docs: [old, mid, fix],
      consents: [
        consent({ document: { id: 'old', published_at: old.published_at } }),
      ],
    });
    expect(r).toHaveLength(1);
  });

  it('keeps an acceptance in another language that is still current', () => {
    const en = doc({ id: 'en1' });
    const ru = doc({ id: 'ru1', locale: 'ru' });
    expect(
      computePending({
        types: ['eula'],
        locale: 'ru',
        docs: [en, ru],
        consents: [
          consent({ document: { id: 'en1', published_at: en.published_at } }),
        ],
      }),
    ).toEqual([]);
  });

  it('falls back to the English text for a language without one', () => {
    const r = computePending({
      types: ['eula'],
      locale: 'ru',
      docs: [doc({ id: 'en1' })],
      consents: [],
    });
    expect(r[0].doc.id).toBe('en1');
  });

  it('counts an old consent without a document for the old types only', () => {
    const noDoc = (t: string) => consent({ consent_type: t, document: null });
    expect(
      computePending({
        types: ['terms'],
        locale: 'en',
        docs: [doc({ doc_type: 'terms' })],
        consents: [noDoc('terms')],
      }),
    ).toEqual([]);
    expect(
      computePending({
        types: ['eula'],
        locale: 'en',
        docs: [doc({})],
        consents: [noDoc('eula')],
      }),
    ).toHaveLength(1);
  });
});

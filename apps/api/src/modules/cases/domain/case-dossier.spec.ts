import { dossierMissing, dossierScore } from './case-dossier';

describe('case dossier', () => {
  const empty = {
    descriptionLength: 50,
    city: null,
    urgency: null,
    budgetMode: 'clarify_later',
    budgetCents: null,
    imagesCount: 0,
    documentsCount: 0,
  };

  it('an empty case misses every item', () => {
    expect(dossierScore(empty)).toBe(0);
    expect(dossierMissing(empty)).toEqual([
      'description',
      'city',
      'urgency',
      'budget',
      'documents',
      'photos',
    ]);
  });

  it('counts a detailed description, city, urgency, budget and both kinds of files', () => {
    expect(
      dossierScore({
        descriptionLength: 200,
        city: 'Chicago',
        urgency: 'soon',
        budgetMode: 'amount',
        budgetCents: 100000,
        imagesCount: 1,
        documentsCount: 2,
      }),
    ).toBe(6);
  });

  it('a blank city and documents only', () => {
    expect(
      dossierMissing({ ...empty, city: '  ', documentsCount: 1 }),
    ).not.toContain('documents');
    expect(dossierMissing({ ...empty, city: '  ' })).toContain('city');
  });
});

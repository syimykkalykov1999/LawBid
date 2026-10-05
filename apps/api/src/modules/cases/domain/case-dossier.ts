/**
 * Owner 2026-10-05: how complete a case is ("Case file 4 of 6") — the one
 * rule the attorney app, the client app and the admin panel all show.
 * The mobile app mirrors it in features/cases/presentation/widgets/
 * case_dossier.dart (same items, same threshold).
 */

/** A description at least this long counts as "detailed". */
export const DOSSIER_DETAILED_DESCRIPTION = 200;

export const DOSSIER_ITEMS = [
  'description',
  'city',
  'urgency',
  'budget',
  'documents',
  'photos',
] as const;
export type DossierItem = (typeof DOSSIER_ITEMS)[number];

export interface DossierInput {
  descriptionLength: number;
  city: string | null;
  urgency: string | null;
  budgetMode: string;
  budgetCents: number | null;
  imagesCount: number;
  documentsCount: number;
}

/** The items the client has not filled in yet, in checklist order. */
export function dossierMissing(c: DossierInput): DossierItem[] {
  const done: Record<DossierItem, boolean> = {
    description: c.descriptionLength >= DOSSIER_DETAILED_DESCRIPTION,
    city: !!c.city && c.city.trim().length > 0,
    urgency: !!c.urgency,
    budget: c.budgetMode === 'amount' && c.budgetCents != null,
    documents: c.documentsCount > 0,
    photos: c.imagesCount > 0,
  };
  return DOSSIER_ITEMS.filter((i) => !done[i]);
}

export function dossierScore(c: DossierInput): number {
  return DOSSIER_ITEMS.length - dossierMissing(c).length;
}

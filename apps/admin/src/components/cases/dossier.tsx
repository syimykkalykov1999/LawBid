import { Badge, type Tone } from '@/components/ui/card';
import type { components } from '@/lib/api/schema';

type Row = components['schemas']['AdminCaseRowDto'];

const TOTAL = 6;

/** Owner 2026-10-05: the same checklist the attorney sees in the app. */
export const DOSSIER_LABELS: Record<Row['dossierMissing'][number], string> = {
  description: 'Подробное описание',
  city: 'Город',
  urgency: 'Срочность',
  budget: 'Бюджет',
  documents: 'Документы',
  photos: 'Фото',
};

const toneOf = (score: number): Tone => (score >= 5 ? 'success' : score >= 3 ? 'gold' : 'neutral');

const files = (c: Pick<Row, 'imagesCount' | 'documentsCount'>) =>
  [c.documentsCount ? `док.: ${c.documentsCount}` : null, c.imagesCount ? `фото: ${c.imagesCount}` : null]
    .filter(Boolean)
    .join(' · ') || 'файлов нет';

/** "Досье 4/6" with the missing items in the tooltip (cases list). */
export function DossierBadge({ c }: { c: Row }) {
  const missing = c.dossierMissing.map((m) => DOSSIER_LABELS[m]).join(', ');
  return (
    <Badge tone={toneOf(c.dossierScore)} title={missing ? `Не заполнено: ${missing}` : 'Всё заполнено'}>
      Досье {c.dossierScore}/{TOTAL} · {files(c)}
    </Badge>
  );
}

/** The case card's checklist: what the client filled in and attached. */
export function DossierChecklist({ c }: { c: Row }) {
  const missing = new Set(c.dossierMissing);
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="font-medium text-ink">Досье</span>
        <DossierBadge c={c} />
      </div>
      <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {(Object.keys(DOSSIER_LABELS) as (keyof typeof DOSSIER_LABELS)[]).map((k) => (
          <li key={k} className={missing.has(k) ? 'text-faint' : 'text-ink'}>
            {missing.has(k) ? '○' : '✓'} {DOSSIER_LABELS[k]}
          </li>
        ))}
      </ul>
    </div>
  );
}

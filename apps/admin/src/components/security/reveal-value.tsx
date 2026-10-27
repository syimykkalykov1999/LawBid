'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';

/** True when the server shortened the value (staff package T11 mask). */
export function isMasked(v: string | null | undefined): boolean {
  return !!v && v.includes('***');
}

/** How long a revealed value stays on screen before it hides again. */
export const REVEAL_VISIBLE_MS = 30_000;

/**
 * Staff package T11: a contact the server masked for the mass-work
 * workspace, with «Показать полностью». The click asks the server (audited,
 * 20 a day); the full value lives only in this component's memory and hides
 * again after 30 seconds. A value that is not masked is shown as is, so the
 * owner and every unmasked workspace see no difference.
 */
export function RevealValue({
  value,
  targetType,
  targetId,
  field,
}: {
  value: string | null | undefined;
  targetType: 'user' | 'license';
  targetId: string;
  field: 'phone' | 'email' | 'barNumber';
}) {
  const toast = useToast();
  const [full, setFull] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => setFull(null), REVEAL_VISIBLE_MS);
    return () => clearTimeout(t);
  }, [full]);

  if (!value) return <>—</>;
  if (full) return <>{full}</>;
  if (!isMasked(value)) return <>{value}</>;
  return (
    <span>
      {value}{' '}
      <button
        type="button"
        className="text-xs text-primary underline disabled:opacity-60"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const r = await api.POST('/admin/pii/reveal', { body: { targetType, targetId, field } });
            setFull(r.data!.data.value);
          } catch (e) {
            toast.error(e);
          } finally {
            setBusy(false);
          }
        }}
      >
        Показать полностью
      </button>
    </span>
  );
}

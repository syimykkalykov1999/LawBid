'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useReason } from '@/components/reason-dialog';
import { useMe } from '@/lib/hooks';

/**
 * Owner 2026-10-28 (privilege): a staff admin opening a case card, dispute
 * or contact-issue report writes a reason first (X-Justification, audited).
 * The owner never has to. `ready` flips once the reason is known; `header`
 * is the value for the X-Justification request header.
 */
export function useViewReason(title: string) {
  const { data: me } = useMe();
  const { ask, dialog } = useReason();
  const router = useRouter();
  const [reason, setReason] = useState<string | null>(null);
  const asked = useRef(false);
  const owner = me?.role === 'super_admin';

  useEffect(() => {
    if (!me || owner || asked.current) return;
    asked.current = true;
    void ask({
      title,
      description: 'Записывается в журнал аудита.',
      label: 'Причина',
      required: true,
      confirm: 'Открыть',
    }).then((r) => {
      if (r) setReason(r.text);
      else router.back();
    });
  }, [me, owner, ask, title, router]);

  return {
    ready: !!me && (owner || reason !== null),
    header: encodeURIComponent(reason ?? ''),
    dialog,
  };
}

'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ErrorNote, PageHeader } from '@/components/page-header';
import { TrustPanel, trustCardKey } from '@/components/trust/trust-panel';
import { api, errorText } from '@/lib/api/client';
import { StatusPill, VERIFICATION_STATUS } from '@/lib/labels';
import { attorneyName } from '@/lib/trust-labels';

/**
 * Owner 2026-10-05 — one attorney's trust card by attorney id (from the
 * holds list, where there may be no verification request to open).
 */
export default function TrustAttorneyPage() {
  const { attorneyId } = useParams<{ attorneyId: string }>();
  const q = useQuery({
    queryKey: trustCardKey(attorneyId),
    queryFn: async () =>
      (await api.GET('/admin/trust/attorneys/{attorneyId}', { params: { path: { attorneyId } } })).data!.data,
  });
  const c = q.data;

  return (
    <>
      <PageHeader
        eyebrow="Люди · Верификация · Уровни доверия"
        title={c ? attorneyName(c.attorney) : 'Адвокат'}
        subtitle={
          c ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              @{c.attorney.username}
              <StatusPill map={VERIFICATION_STATUS} value={c.attorney.verificationStatus} />
              {c.latestRequestId ? (
                <Link href={`/verification/${c.latestRequestId}`} className="text-gold-600 hover:underline">
                  открыть заявку на верификацию
                </Link>
              ) : null}
            </span>
          ) : undefined
        }
      />
      {q.error ? <ErrorNote text={errorText(q.error)} /> : <TrustPanel attorneyId={attorneyId} />}
    </>
  );
}

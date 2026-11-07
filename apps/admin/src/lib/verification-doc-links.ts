'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { linkFreshMs } from '@/lib/review-flow';

type DocLink = components['schemas']['DocumentUrlDto'];

/**
 * The signed link of one verification document: one audited view per
 * document, kept in the query cache until 30 s before the signature ends, so
 * the card thumbnails, the review screen and the lightbox reuse it instead of
 * asking the server again.
 */
export const docKey = (id: string) => ['verification-doc-url', id] as const;

export async function fetchDocLink(justification: string, documentId: string): Promise<DocLink> {
  const res = await api.POST('/admin/verification/documents/{documentId}/url', {
    params: { path: { documentId }, header: { 'X-Justification': encodeURIComponent(justification) } },
  });
  return res.data!.data;
}

/** «Too many views this hour» (the per-admin cap). */
export const isDocCap = (e: unknown) => e instanceof ApiError && e.status === 429;

/** The signed links of the documents on screen (one request per document, cached for the signature lifetime). */
export function useDocLinks(justification: string, docs: readonly { id: string }[]) {
  const qc = useQueryClient();
  const ids = docs.map((d) => d.id);
  const q = useQuery({
    queryKey: ['verification-doc-urls', ...ids],
    enabled: ids.length > 0,
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
    queryFn: async () => {
      const urls: Record<string, string> = {};
      for (const id of ids) {
        const link = await qc.fetchQuery({
          queryKey: docKey(id),
          queryFn: () => fetchDocLink(justification, id),
          staleTime: (x) => linkFreshMs((x.state.data as DocLink | undefined)?.expiresAt),
        });
        urls[id] = link.url;
      }
      return urls;
    },
  });
  return { urls: q.data ?? {}, loading: q.isPending && ids.length > 0, capped: !!q.error && isDocCap(q.error), failed: !!q.error };
}

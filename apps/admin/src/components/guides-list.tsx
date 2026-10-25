'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GuideDone } from '@/components/guide-done';
import { SectionTitle } from '@/components/page-header';
import { Badge, Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { groupGuides, isStale, searchGuides, verifiedWord, type GuideMeta } from '@/lib/guides';

export type GuideListItem = GuideMeta & { body: string };

/** List of guides by category with a search box and a «Сделано» tick each. */
export function GuidesList({ guides }: { guides: GuideListItem[] }) {
  const [q, setQ] = useState('');
  const found = searchGuides(guides, q);
  const groups = groupGuides(found);
  return (
    <>
      <div className="mb-6 max-w-md">
        <Input
          type="search"
          aria-label="Поиск по инструкциям"
          placeholder="Поиск: Stripe, DNS, Apple, ключи…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {groups.length === 0 ? <p className="text-sm text-muted">Ничего не нашлось. Попробуйте другое слово.</p> : null}
      {groups.map((g) => (
        <section key={g.id}>
          <SectionTitle>{g.title}</SectionTitle>
          <div className="mb-6 grid gap-3 md:grid-cols-2">
            {g.guides.map((x) => (
              <Card key={x.id} className="flex min-w-0 flex-col gap-2 p-4" data-testid={`guide-${x.id}`}>
                <Link href={`/guides/${x.id}`} className="text-sm font-medium text-heading underline-offset-2 hover:underline">
                  {x.title}
                </Link>
                <div className="flex flex-wrap gap-1.5 text-xs text-muted">
                  <span>{x.time}</span>
                  <span aria-hidden>·</span>
                  <span className="break-words">{x.cost.length > 70 ? `${x.cost.slice(0, 67)}…` : x.cost}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-faint">
                  {verifiedWord(x.verified)}
                  {isStale(x.verified) ? <Badge tone="warning">пора перепроверить</Badge> : null}
                </div>
                <div className="mt-auto pt-1">
                  <GuideDone guide={x} />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

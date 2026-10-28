'use client';

import { ArrowRight } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { OverflowTabs } from '@/components/ui/overflow-tabs';
import { useDeskEmbed } from '@/components/desk/embed';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { supportReviewHref } from '@/lib/review-flow';
import { canWriteSupport } from './support-labels';

const LINKS = [
  { href: '/support', label: 'Обращения' },
  { href: '/support/macros', label: 'Готовые ответы' },
  { href: '/support/team', label: 'Команда' },
  { href: '/support/settings', label: 'Часы и SLA' },
];

/** Pages inside «Поддержка»; one even row, «Ещё ▾» on narrow screens. */
export function SupportNav() {
  const pathname = usePathname();
  // Staff package T8: on the worker's desk the desk tabs replace this row.
  const embedded = useDeskEmbed();
  if (embedded) return null;
  return <OverflowTabs className="mb-5" label="Поддержка" items={LINKS} active={LINKS.find((l) => l.href === pathname)?.href} />;
}

/**
 * «Следующее обращение»: my most urgent open ticket, else the most overdue
 * free one (taken by me). Opens it on the review screen, where answering moves on.
 */
export function NextTicketButton({ label = 'Следующее обращение', size = 'sm' }: { label?: string; size?: 'sm' | 'default' }) {
  const { data: me } = useMe();
  const router = useRouter();
  const toast = useToast();
  // Staff package T8: the desk has its own «Следующий» (leases).
  const embedded = useDeskEmbed();
  const next = useMutation({
    mutationFn: async () => (await api.POST('/admin/support/tickets/next')).data!.data,
    onSuccess: (r) => {
      if (r.ticket) router.push(supportReviewHref(r.ticket.id));
      else toast.success('Очередь пуста: открытых обращений нет');
    },
    onError: (e) => toast.error(e),
  });
  if (embedded || !canWriteSupport(me)) return null;
  return (
    <Button variant="gold" size={size} loading={next.isPending} onClick={() => next.mutate()}>
      {next.isPending ? null : <ArrowRight size={15} weight="bold" />}
      {label}
    </Button>
  );
}

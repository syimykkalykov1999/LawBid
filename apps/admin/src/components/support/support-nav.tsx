'use client';

import { ArrowRight } from '@phosphor-icons/react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { canWriteSupport } from './support-labels';

const LINKS = [
  { href: '/support', label: 'Обращения' },
  { href: '/support/macros', label: 'Готовые ответы' },
  { href: '/support/team', label: 'Команда' },
  { href: '/support/settings', label: 'Часы и SLA' },
];

/** Pages inside «Поддержка»; scrolls sideways on narrow screens. */
export function SupportNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Поддержка" className="-mx-1 mb-5 overflow-x-auto px-1">
      <ul className="flex w-max gap-1 rounded-[12px] border border-line bg-surface-2 p-1">
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'block rounded-[9px] px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors',
                  active ? 'bg-surface text-heading shadow-sm' : 'text-muted hover:text-ink',
                )}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * «Следующее обращение»: my most urgent open ticket, else the most overdue
 * free one (taken by me). Opens it in focus mode, where answering moves on.
 */
export function NextTicketButton({ label = 'Следующее обращение', size = 'sm' }: { label?: string; size?: 'sm' | 'default' }) {
  const { data: me } = useMe();
  const router = useRouter();
  const toast = useToast();
  const next = useMutation({
    mutationFn: async () => (await api.POST('/admin/support/tickets/next')).data!.data,
    onSuccess: (r) => {
      if (r.ticket) router.push(`/support/${r.ticket.id}?focus=1`);
      else toast.success('Очередь пуста: открытых обращений нет');
    },
    onError: (e) => toast.error(e),
  });
  if (!canWriteSupport(me)) return null;
  return (
    <Button variant="gold" size={size} loading={next.isPending} onClick={() => next.mutate()}>
      {next.isPending ? null : <ArrowRight size={15} weight="bold" />}
      {label}
    </Button>
  );
}

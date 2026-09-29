'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMe } from '@/lib/hooks';
import { ROLE_LABEL, sectionsFor } from '@/lib/rbac';
import { cn } from '@/lib/utils';

export function Nav() {
  const { data: me } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();

  const signOut = async () => {
    await fetch('/api/auth/session', { method: 'DELETE' });
    qc.clear();
    router.replace('/login');
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-navy text-white">
      <div className="px-5 py-5">
        <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
          LawBid
        </div>
        <div className="text-lg font-semibold">Админ-панель</div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {me
          ? sectionsFor(me.role).map((s) =>
              s.soon ? (
                <span
                  key={s.href}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-white/40"
                  title="Появится на следующих этапах"
                >
                  {s.label}
                  <span className="text-[10px] uppercase tracking-wide">
                    скоро
                  </span>
                </span>
              ) : (
                <Link
                  key={s.href}
                  href={s.href}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white',
                    (s.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(s.href)) && 'bg-white/10 text-white',
                  )}
                >
                  {s.label}
                </Link>
              ),
            )
          : null}
      </nav>
      <div className="border-t border-white/10 px-5 py-4 text-sm">
        {me ? (
          <>
            <div className="truncate" title={me.email}>
              {me.email}
            </div>
            <div className="text-xs text-white/60">{ROLE_LABEL[me.role]}</div>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 text-xs text-gold underline-offset-2 hover:underline"
        >
          Выйти
        </button>
      </div>
    </aside>
  );
}

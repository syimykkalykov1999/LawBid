import { LogoMark } from '@/components/shell/logo';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { InviteForm } from './invite-form';

/** Owner 2026-10-16: the page an invited administrator opens from the
 * one-time link (valid 72 hours). Outside the signed-in shell. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="relative flex min-h-screen flex-col px-5 py-6 sm:px-10">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-[16px] font-semibold tracking-tight text-heading">
            Law<span className="text-gold">Bid</span>
          </span>
        </span>
        <ThemeToggle />
      </div>
      <div className="flex flex-1 items-center justify-center py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">Приглашение</div>
            <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-heading">Доступ в панель LawBid</h1>
            <p className="mt-2 text-sm text-muted">Придумайте логин и пароль. Ссылка работает один раз.</p>
          </div>
          <InviteForm token={token} />
        </div>
      </div>
    </main>
  );
}

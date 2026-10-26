import { Suspense } from 'react';
import { LogoMark } from '@/components/shell/logo';
import { ThemeToggle } from '@/components/shell/theme-toggle';
import { LoginForm } from './login-form';
import { LoginHero } from './login-hero';

export default function LoginPage() {
  return (
    <main className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <LoginHero />
      <section className="relative flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2.5 lg:invisible">
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold-600">Панель управления</div>
              <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-heading">Вход администратора</h1>
              <p className="mt-2 text-sm text-muted">Логин, пароль и код из приложения-аутентификатора.</p>
            </div>
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </div>
        <p className="text-center text-xs text-faint">Доступ только для команды LawBid. Все действия пишутся в журнал аудита.</p>
      </section>
    </main>
  );
}

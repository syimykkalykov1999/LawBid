import { Suspense } from 'react';
import { LoginForm } from './login-form';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy px-4">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] bg-surface p-6 shadow-xl">
        <div className="mb-6">
          <div className="text-xs font-medium uppercase tracking-[0.2em] text-gold">
            LawBid
          </div>
          <h1 className="mt-1 text-xl font-semibold text-navy">
            Вход администратора
          </h1>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}

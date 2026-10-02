'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ApiError, errorText, publicApi } from '@/lib/api/client';

type Step =
  | { kind: 'password' }
  | { kind: 'forgot-login' }
  | { kind: 'forgot-answer'; login: string; question: string }
  | { kind: 'email' }
  | { kind: 'code'; email: string }
  | { kind: 'totp'; ticket: string; useRecovery: boolean };

/**
 * Sign-in: login + password (or, as an alternative first step, an emailed
 * code) signs in on its own. An admin who turned two-factor on in the
 * profile is then asked for the authenticator code. The super admin can
 * reset a forgotten password by answering the security question.
 *
 * A finished sign-in puts the admin JWT in an httpOnly cookie — set by the
 * /api/public/auth proxy (no second step) or by app/api/auth/session
 * (authenticator step), never by JS.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: 'password' });
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [answer, setAnswer] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only same-site paths: `//evil.com` would be an open redirect.
  const next = params.get('next');
  const go = () => router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
      if (e instanceof ApiError && e.code === 'ADMIN_TICKET_INVALID') {
        setStep({ kind: 'password' });
      }
    } finally {
      setBusy(false);
    }
  };

  const signInWithPassword = () =>
    run(async () => {
      const { data } = await publicApi.POST('/admin/auth/login/password', {
        body: { login: login.trim(), password },
      });
      const d = data!.data;
      setPassword('');
      setCode('');
      setNotice(null);
      if (d.ticket) setStep({ kind: 'totp', ticket: d.ticket, useRecovery: false });
      else go();
    });

  const askQuestion = () =>
    run(async () => {
      const { data } = await publicApi.POST('/admin/auth/recover/question', {
        body: { login: login.trim() },
      });
      setStep({ kind: 'forgot-answer', login: login.trim(), question: data!.data.question });
    });

  const resetPassword = (loginName: string) =>
    run(async () => {
      await publicApi.POST('/admin/auth/recover/password', {
        body: { login: loginName, answer, newPassword },
      });
      setAnswer('');
      setNewPassword('');
      setPassword('');
      setNotice('Пароль обновлён, все сессии завершены. Войдите с новым паролем.');
      setStep({ kind: 'password' });
    });

  const start = () =>
    run(async () => {
      await publicApi.POST('/admin/auth/login/start', { body: { email } });
      setCode('');
      setStep({ kind: 'code', email });
    });

  const verify = () =>
    run(async () => {
      const { data } = await publicApi.POST('/admin/auth/login/verify', {
        body: { email, code },
      });
      const d = data!.data;
      setCode('');
      if (d.ticket) setStep({ kind: 'totp', ticket: d.ticket, useRecovery: false });
      else go();
    });

  const finish = (ticket: string, useRecovery: boolean) =>
    run(async () => {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          useRecovery ? { ticket, recoveryCode: code } : { ticket, code },
        ),
      });
      const body = (await res.json()) as {
        error?: {
          code: string;
          message: string;
          details?: Record<string, unknown>;
        };
      };
      if (!res.ok) {
        throw new ApiError(
          res.status,
          body.error?.code ?? 'INTERNAL_ERROR',
          body.error?.message ?? '',
          body.error?.details,
        );
      }
      go();
    });

  if (step.kind === 'password') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void signInWithPassword();
        }}
      >
        {notice ? (
          <p className="rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">{notice}</p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="login">Логин</Label>
          <Input
            id="login"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Пароль</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <ErrorNote text={error} />
        <Button type="submit" className="w-full" disabled={busy || !login.trim() || !password}>
          Продолжить
        </Button>
        <div className="flex items-center justify-between text-sm text-muted">
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => {
              setError(null);
              setNotice(null);
              setStep({ kind: 'forgot-login' });
            }}
          >
            Забыли пароль?
          </button>
          <button
            type="button"
            className="underline-offset-2 hover:underline"
            onClick={() => {
              setError(null);
              setNotice(null);
              setStep({ kind: 'email' });
            }}
          >
            Войти по коду из почты
          </button>
        </div>
      </form>
    );
  }

  if (step.kind === 'forgot-login') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void askQuestion();
        }}
      >
        <p className="text-sm text-muted">
          Восстановление пароля — только для супер-админа: ответьте на секретный вопрос. Остальным админам пароль задаёт
          супер-админ или тот, кому он дал право управлять админами.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="forgot-login">Логин</Label>
          <Input
            id="forgot-login"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
          />
        </div>
        <ErrorNote text={error} />
        <Button type="submit" className="w-full" disabled={busy || !login.trim()}>
          Показать вопрос
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => {
            setError(null);
            setStep({ kind: 'password' });
          }}
        >
          Назад ко входу
        </button>
      </form>
    );
  }

  if (step.kind === 'forgot-answer') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void resetPassword(step.login);
        }}
      >
        <div className="rounded-[var(--radius-md)] border border-line bg-surface-2 px-3.5 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">Секретный вопрос</div>
          <div className="mt-1 text-sm text-ink">{step.question}</div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="answer">Ответ</Label>
          <Input
            id="answer"
            autoComplete="off"
            required
            autoFocus
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-password">Новый пароль</Label>
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="text-xs text-faint">От 10 символов, буквы и цифры.</p>
        </div>
        <ErrorNote text={error} />
        <Button type="submit" className="w-full" disabled={busy || !answer.trim() || newPassword.length < 10}>
          Сменить пароль
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => {
            setError(null);
            setAnswer('');
            setNewPassword('');
            setStep({ kind: 'password' });
          }}
        >
          Назад ко входу
        </button>
      </form>
    );
  }

  if (step.kind === 'email') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <ErrorNote text={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          Получить код
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => {
            setError(null);
            setStep({ kind: 'password' });
          }}
        >
          Войти по логину и паролю
        </button>
      </form>
    );
  }

  if (step.kind === 'code') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void verify();
        }}
      >
        <p className="text-sm text-muted">
          Код отправлен на <b className="text-ink">{step.email}</b>.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="code">Код из письма</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
        </div>
        <ErrorNote text={error} />
        <Button
          type="submit"
          className="w-full"
          disabled={busy || code.length !== 6}
        >
          Продолжить
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => setStep({ kind: 'email' })}
        >
          Другой email
        </button>
      </form>
    );
  }

  if (step.kind === 'totp') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void finish(step.ticket, step.useRecovery);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="totp">
            {step.useRecovery
              ? 'Recovery-код'
              : 'Код из приложения-аутентификатора'}
          </Label>
          <Input
            id="totp"
            inputMode={step.useRecovery ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            required
            autoFocus
            value={code}
            onChange={(e) =>
              setCode(
                step.useRecovery
                  ? e.target.value.toUpperCase()
                  : e.target.value.replace(/\D/g, '').slice(0, 6),
              )
            }
          />
        </div>
        <ErrorNote text={error} />
        <Button type="submit" className="w-full" disabled={busy}>
          Войти
        </Button>
        <button
          type="button"
          className="w-full text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => {
            setCode('');
            setStep({ ...step, useRecovery: !step.useRecovery });
          }}
        >
          {step.useRecovery
            ? 'Использовать аутентификатор'
            : 'Нет доступа к аутентификатору?'}
        </button>
      </form>
    );
  }

  return null;
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { ApiError, errorText, publicApi } from '@/lib/api/client';

type Step =
  | { kind: 'email' }
  | { kind: 'code'; email: string }
  | {
      kind: 'totp';
      ticket: string;
      enrollment: { secret: string; otpauthUri: string } | null;
      useRecovery: boolean;
    }
  | { kind: 'recovery-codes'; codes: string[] };

/**
 * docs/06 §2.1: email → emailed code → mandatory TOTP. On the first
 * sign-in the API returns an enrollment (QR + secret); after the code is
 * accepted, ten recovery codes are shown exactly once. The final exchange
 * happens in app/api/auth/session so the admin JWT lands in an httpOnly
 * cookie, never in JS.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [step, setStep] = useState<Step>({ kind: 'email' });
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
        setStep({ kind: 'email' });
      }
    } finally {
      setBusy(false);
    }
  };

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
      setStep({
        kind: 'totp',
        ticket: d.ticket,
        enrollment: d.totpEnrollment ?? null,
        useRecovery: false,
      });
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
        data?: { recoveryCodes?: string[] };
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
      if (body.data?.recoveryCodes?.length) {
        setStep({ kind: 'recovery-codes', codes: body.data.recoveryCodes });
      } else {
        go();
      }
    });

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
        {step.enrollment ? (
          <Enrollment
            secret={step.enrollment.secret}
            uri={step.enrollment.otpauthUri}
          />
        ) : null}
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
        {!step.enrollment ? (
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
        ) : null}
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Аутентификатор привязан. Сохраните recovery-коды — они показываются{' '}
        <b>один раз</b> и понадобятся, если потеряете доступ к приложению.
      </p>
      <ul className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-canvas p-3 font-mono text-sm">
        {step.codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() =>
          void navigator.clipboard.writeText(step.codes.join('\n'))
        }
      >
        Скопировать
      </Button>
      <Button type="button" className="w-full" onClick={go}>
        Я сохранил коды
      </Button>
    </div>
  );
}

function Enrollment({ secret, uri }: { secret: string; uri: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) {
      void QRCode.toCanvas(canvas.current, uri, { width: 180, margin: 1 });
    }
  }, [uri]);
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-line p-3">
      <p className="text-sm">
        Первый вход: отсканируйте QR в приложении-аутентификаторе (Google
        Authenticator, 1Password, Authy) и введите код ниже.
      </p>
      <canvas
        ref={canvas}
        className="mx-auto block"
        aria-label="QR-код для аутентификатора"
      />
      <p className="break-all text-center font-mono text-xs text-muted">
        {secret}
      </p>
    </div>
  );
}

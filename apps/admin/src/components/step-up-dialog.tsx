'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorText } from '@/lib/api/client';

/**
 * Owner 2026-10-01: a fresh authenticator code before a sensitive change
 * (API keys). The server keeps it valid for 5 minutes of this session.
 */
export function StepUpDialog({
  open,
  onDone,
  onCancel,
}: {
  open: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.POST('/admin/auth/step-up', { body: { code } });
      if (r.error) throw r.error;
      setCode('');
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
          Подтверждение
        </div>
        <h2 className="mt-1 text-lg font-semibold text-navy">
          Код из приложения-аутентификатора
        </h2>
        <p className="mt-1 text-sm text-muted">
          Для изменения ключей нужен свежий 6-значный код. Он действует 5
          минут.
        </p>
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 6) void submit();
          }}
        >
          <Input
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="text-center font-mono text-lg tracking-[0.4em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onCancel}>
              Отмена
            </Button>
            <Button type="submit" disabled={busy || code.length !== 6}>
              Подтвердить
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

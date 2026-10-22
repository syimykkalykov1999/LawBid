'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorText } from '@/lib/api/client';

/**
 * Owner 2026-10-01 / 2026-10-22: a fresh authenticator code before a
 * sensitive action (money out, someone's phone or password, keys, admin
 * 2FA resets). The authenticator is mandatory, so it is always the code —
 * no password fallback. The server keeps it valid for 5 minutes of this
 * session; every try is written to the audit log.
 */
export function StepUpDialog({
  open,
  onDone,
  onCancel,
  description,
}: {
  description?: string;
  open: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = code.length === 6;

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
    <Dialog
      open={open}
      onClose={() => {
        setCode('');
        setError(null);
        onCancel();
      }}
      eyebrow="Подтверждение"
      title="Код из приложения-аутентификатора"
      description={description ?? 'Нужен свежий 6-значный код. Подтверждение действует 5 минут.'}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        <Input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="123456"
          className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setCode('');
              setError(null);
              onCancel();
            }}
          >
            Отмена
          </Button>
          <Button type="submit" loading={busy} disabled={!ready}>
            Подтвердить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

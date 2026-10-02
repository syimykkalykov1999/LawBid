'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
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
  description = 'Для изменения ключей нужен свежий 6-значный код. Он действует 5 минут.',
}: {
  description?: string;
  open: boolean;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onClose={onCancel}
      eyebrow="Подтверждение"
      title="Код из приложения-аутентификатора"
      description={description}
    >
      <form
        className="space-y-3"
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
          className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
          <Button type="submit" loading={busy} disabled={code.length !== 6}>
            Подтвердить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

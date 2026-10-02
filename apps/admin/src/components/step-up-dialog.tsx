'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api, errorText } from '@/lib/api/client';
import { useMe } from '@/lib/hooks';

/**
 * Owner 2026-10-01: a fresh confirmation before a sensitive change (API
 * keys, someone's password): the authenticator code when two-factor is on,
 * otherwise the admin's own password. The server keeps it valid for 5
 * minutes of this session.
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
  const { data: me } = useMe();
  const byCode = me?.totpEnabled ?? false;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = byCode ? code.length === 6 : code.length > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api.POST('/admin/auth/step-up', {
        body: byCode ? { code } : { password: code },
      });
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
      title={byCode ? 'Код из приложения-аутентификатора' : 'Подтвердите своим паролем'}
      description={
        description ??
        (byCode
          ? 'Нужен свежий 6-значный код. Он действует 5 минут.'
          : 'Введите ваш пароль от админки. Подтверждение действует 5 минут.')
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready) void submit();
        }}
      >
        {byCode ? (
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
        ) : (
          <Input
            autoFocus
            type="password"
            autoComplete="current-password"
            placeholder="Пароль"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        )}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
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

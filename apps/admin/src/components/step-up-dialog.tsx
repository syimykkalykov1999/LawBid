'use client';

import { Fingerprint } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ApiError, api, errorText } from '@/lib/api/client';
import { PASSKEY_CANCELLED_TEXT, passkeyCancelled, passkeysSupported, signWithPasskey } from '@/lib/webauthn';

/**
 * Owner 2026-10-01 / 2026-10-22: a fresh authenticator code before a
 * sensitive action (money out, someone's phone or password, keys, admin
 * 2FA resets). The authenticator is mandatory, so it is always the code —
 * no password fallback. The server keeps it valid for 5 minutes of this
 * session; every try is written to the audit log. Owner 2026-10-22: an
 * admin with a passkey (Face ID / Touch ID / Windows Hello / hardware
 * key) can confirm with it instead of the code.
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
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  // Set after mount: the server render must not differ from the browser's.
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => setCanPasskey(passkeysSupported()), []);

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

  const submitPasskey = async () => {
    setPasskeyBusy(true);
    setError(null);
    try {
      const opts = await api.POST('/admin/auth/step-up/passkey/options');
      const { challengeId, options } = opts.data!.data;
      const response = await signWithPasskey(options);
      await api.POST('/admin/auth/step-up/passkey', { body: { challengeId, response } });
      setCode('');
      onDone();
    } catch (e) {
      if (passkeyCancelled(e)) setError(PASSKEY_CANCELLED_TEXT);
      else if (e instanceof ApiError && e.code === 'PASSKEY_NOT_FOUND')
        setError('Ключ доступа не добавлен — используйте код.');
      else setError(errorText(e));
    } finally {
      setPasskeyBusy(false);
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
        {canPasskey ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            loading={passkeyBusy}
            disabled={busy}
            onClick={() => void submitPasskey()}
          >
            <Fingerprint size={16} /> Подтвердить ключом доступа
          </Button>
        ) : null}
      </form>
    </Dialog>
  );
}

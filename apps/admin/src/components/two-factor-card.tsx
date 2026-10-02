'use client';

import { DeviceMobile } from '@phosphor-icons/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useRef, useState } from 'react';
import { ErrorNote } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, errorText } from '@/lib/api/client';

/**
 * Optional two-factor (owner 2026-10-02): off by default, nobody is forced
 * to install an authenticator. Whoever wants it scans a QR code, confirms
 * with a code and gets ten one-time recovery codes; from then on sign-in
 * asks for the code after the password.
 */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [setup, setSetup] = useState<{
    secret: string;
    otpauthUri: string;
  } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');

  const begin = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/auth/2fa/begin');
      return r.data!.data;
    },
    onSuccess: (d) => {
      setCode('');
      setSetup(d);
    },
    onError: (e) => toast.error(e),
  });
  const enable = useMutation({
    mutationFn: async () => {
      const r = await api.POST('/admin/auth/2fa/enable', { body: { code } });
      return r.data!.data.recoveryCodes;
    },
    onSuccess: (c) => {
      setSetup(null);
      setCode('');
      setCodes(c);
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });
  const disable = useMutation({
    mutationFn: async () => {
      await api.POST('/admin/auth/2fa/disable', { body: { code } });
    },
    onSuccess: () => {
      setCode('');
      toast.success('Двухфакторный вход выключен');
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (e) => toast.error(e),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DeviceMobile size={16} weight="light" /> Двухфакторный вход {enabled ? <Badge tone="gold">включён</Badge> : <Badge>выключен</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5 text-sm">
        {codes ? (
          <div className="space-y-3">
            <p>
              Готово. Сохраните коды восстановления — они показываются <b>один раз</b> и пригодятся, если потеряете телефон.
            </p>
            <ul className="grid grid-cols-2 gap-1 rounded-[var(--radius-md)] bg-canvas p-3 font-mono text-sm">
              {codes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void navigator.clipboard.writeText(codes.join('\n'))}>
                Скопировать
              </Button>
              <Button type="button" onClick={() => setCodes(null)}>
                Я сохранил
              </Button>
            </div>
          </div>
        ) : enabled ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              disable.mutate();
            }}
          >
            <p className="text-muted">При входе после пароля спрашивается код из приложения. Чтобы выключить, введите текущий код (или код восстановления).</p>
            <div className="space-y-1.5">
              <Label htmlFor="tf-off">Код</Label>
              <Input id="tf-off" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.trim())} />
            </div>
            <ErrorNote text={disable.error ? errorText(disable.error) : null} />
            <Button type="submit" variant="outline" loading={disable.isPending} disabled={code.length < 6}>
              Выключить
            </Button>
          </form>
        ) : setup ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              enable.mutate();
            }}
          >
            <Enrollment secret={setup.secret} uri={setup.otpauthUri} />
            <div className="space-y-1.5">
              <Label htmlFor="tf-on">Код из приложения</Label>
              <Input
                id="tf-on"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <ErrorNote text={enable.error ? errorText(enable.error) : null} />
            <div className="flex gap-2">
              <Button type="submit" loading={enable.isPending} disabled={code.length !== 6}>
                Включить
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                Отмена
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-muted">
              Не обязателен: без него вход только по логину и паролю. Если хотите дополнительную защиту, привяжите приложение-аутентификатор (Google
              Authenticator, 1Password, Authy).
            </p>
            <Button type="button" variant="outline" loading={begin.isPending} onClick={() => begin.mutate()}>
              Подключить
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Enrollment({ secret, uri }: { secret: string; uri: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) void QRCode.toCanvas(canvas.current, uri, { width: 180, margin: 1 });
  }, [uri]);
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-line p-3">
      <p>Отсканируйте QR в приложении-аутентификаторе и введите код ниже.</p>
      <canvas ref={canvas} className="mx-auto block" aria-label="QR-код для аутентификатора" />
      <p className="break-all text-center font-mono text-xs text-muted">{secret}</p>
    </div>
  );
}

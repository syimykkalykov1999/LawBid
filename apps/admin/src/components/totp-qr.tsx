'use client';

import QRCode from 'qrcode';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';

/** The authenticator setup QR (otpauth://) with the secret for manual entry. */
export function TotpQr({ secret, uri }: { secret: string; uri: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvas.current) void QRCode.toCanvas(canvas.current, uri, { width: 180, margin: 1 });
  }, [uri]);
  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-line p-3 text-sm">
      <p>
        Откройте приложение-аутентификатор (Google Authenticator, 1Password, Authy), отсканируйте QR и введите код
        ниже.
      </p>
      <canvas ref={canvas} className="mx-auto block" aria-label="QR-код для аутентификатора" />
      <p className="break-all text-center font-mono text-xs text-muted">{secret}</p>
    </div>
  );
}

/** Ten one-time recovery codes, shown once. */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  return (
    <div className="space-y-3 text-sm">
      <p>
        Готово. Сохраните коды восстановления — они показываются <b>один раз</b> и пригодятся, если потеряете телефон.
        Каждый код срабатывает один раз.
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
        <Button type="button" onClick={onDone}>
          Я сохранил коды
        </Button>
      </div>
    </div>
  );
}

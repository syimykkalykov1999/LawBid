'use client';

import { useEffect, useRef, useState } from 'react';
import { StepUpDialog } from '@/components/step-up-dialog';
import { registerStepUpPrompt } from '@/lib/api/client';

/**
 * Owner 2026-10-22 (system audit #2, item 2): one step-up dialog for the
 * whole panel. When an action answers ADMIN_STEP_UP_REQUIRED (money out,
 * refunds, someone's phone or password, bulk user actions, admin 2FA
 * resets, keys), the API client asks here for a fresh authenticator code
 * and repeats the action by itself.
 */
export function StepUpHost() {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    registerStepUpPrompt(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setOpen(true);
        }),
    );
    return () => registerStepUpPrompt(null);
  }, []);

  const finish = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  return (
    <StepUpDialog
      open={open}
      description="Это действие с деньгами или чужим аккаунтом. Введите свежий код из приложения-аутентификатора — подтверждение действует 5 минут."
      onDone={() => finish(true)}
      onCancel={() => finish(false)}
    />
  );
}

'use client';

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface ConfirmOptions {
  title: string;
  description?: React.ReactNode;
  confirm?: string;
  danger?: boolean;
}

/**
 * Promise-based yes/no dialog for actions that need no typed reason.
 * `const { confirm, dialog } = useConfirm()`; render `{dialog}` once.
 */
export function useConfirm() {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ opts, resolve })),
    [],
  );

  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };

  const dialog = (
    <Dialog
      open={!!state}
      onClose={() => close(false)}
      eyebrow="Подтверждение"
      title={state?.opts.title}
      description={state?.opts.description}
    >
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => close(false)}>
          Отмена
        </Button>
        <Button
          type="button"
          autoFocus
          variant={state?.opts.danger ? 'danger' : 'default'}
          onClick={() => close(true)}
        >
          {state?.opts.confirm ?? 'Подтвердить'}
        </Button>
      </div>
    </Dialog>
  );

  return { confirm, dialog };
}

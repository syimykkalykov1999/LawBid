import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LazyMotion, domMax } from 'motion/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyButton } from './copy-button';
import { ToastProvider, useToast } from './toast';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const wrap = (ui: React.ReactNode) =>
  render(
    <LazyMotion features={domMax}>
      <ToastProvider>{ui}</ToastProvider>
    </LazyMotion>,
  );

describe('CopyButton', () => {
  it('copies the value, says «Скопировано» and does not open the row under it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const row = vi.fn();
    wrap(
      <div onClick={row}>
        <CopyButton text="u-123" label="Скопировать id" />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать id' }));
    expect(writeText).toHaveBeenCalledWith('u-123');
    expect(row).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText('Скопировано')).toBeTruthy());
  });

  it('no clipboard (insecure origin): says so instead of failing silently', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    wrap(<CopyButton text="x" />);
    fireEvent.click(screen.getByRole('button', { name: 'Скопировать' }));
    await waitFor(() => expect(screen.getByText('Буфер обмена недоступен в этом браузере')).toBeTruthy());
  });
});

function UndoHarness({ onUndo }: { onUndo: () => void }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.undo('Звёзды выключены', onUndo)}>
      go
    </button>
  );
}

describe('toast «Отменить»', () => {
  it('shows the button; a click runs the undo and closes the toast', async () => {
    const onUndo = vi.fn();
    wrap(<UndoHarness onUndo={onUndo} />);
    fireEvent.click(screen.getByText('go'));
    const undo = await screen.findByRole('button', { name: 'Отменить' });
    act(() => undo.click());
    expect(onUndo).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Отменить' })).toBeNull());
  });
});

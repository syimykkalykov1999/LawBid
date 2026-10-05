import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BulkBar, PageSelectBox, RowSelectBox, useSelection } from '@/components/bulk/bulk-controls';
import { StatesPicker } from '@/components/states-picker';
import { ToastProvider } from '@/components/ui/toast';

afterEach(cleanup);

const NOUN = ['публикацию', 'публикации', 'публикаций'] as const;

function List({ onSelectAll }: { onSelectAll: () => Promise<string[]> }) {
  const sel = useSelection('k');
  const ids = ['a', 'b', 'c'];
  return (
    <ToastProvider>
      <BulkBar
        selectedCount={sel.selected.size}
        noun={NOUN}
        onClear={sel.clear}
        onSelectAll={async () => {
          sel.replace(await onSelectAll());
          return false;
        }}
      >
        <button type="button">Удалить</button>
      </BulkBar>
      <PageSelectBox selected={sel.selected} ids={ids} onToggle={sel.togglePage} />
      {ids.map((id) => (
        <RowSelectBox key={id} selected={sel.selected} id={id} onToggle={sel.toggle} />
      ))}
    </ToastProvider>
  );
}

describe('BulkBar', () => {
  it('counts the ticked rows and shows the actions only when something is selected', () => {
    render(<List onSelectAll={async () => []} />);
    expect(screen.getByTestId('bulk-count').textContent).toBe('Ничего не выбрано');
    expect(screen.queryByText('Удалить')).toBeNull();
    const rows = screen.getAllByLabelText('Выбрать');
    fireEvent.click(rows[0]);
    fireEvent.click(rows[2]);
    expect(screen.getByTestId('bulk-count').textContent).toBe('Выбрано: 2 публикации');
    expect(screen.getByText('Удалить')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Выбрать всё на странице'));
    expect(screen.getByTestId('bulk-count').textContent).toBe('Выбрано: 3 публикации');
    fireEvent.click(screen.getByText('Снять выбор'));
    expect(screen.getByTestId('bulk-count').textContent).toBe('Ничего не выбрано');
  });

  it('"select all by filter" takes every id the loader returns', async () => {
    const load = vi.fn(async () => Array.from({ length: 125 }, (_, i) => `id${i}`));
    render(<List onSelectAll={load} />);
    await act(async () => {
      fireEvent.click(screen.getByText('Выбрать всё по фильтру'));
    });
    expect(load).toHaveBeenCalledOnce();
    expect(screen.getByTestId('bulk-count').textContent).toBe('Выбрано: 125 публикаций');
  });
});

function Picker() {
  const [mode, setMode] = useState<'all' | 'pick'>('all');
  const [codes, setCodes] = useState<string[]>([]);
  return (
    <>
      <StatesPicker mode={mode} onMode={setMode} value={codes} onChange={setCodes} />
      <output data-testid="codes">{codes.join(',')}</output>
    </>
  );
}

describe('StatesPicker', () => {
  it('switches from all states to a chosen set, with search and removable chips', () => {
    render(<Picker />);
    expect(screen.queryByLabelText('Поиск штата')).toBeNull();
    fireEvent.click(screen.getByText('Выбрать штаты'));
    fireEvent.change(screen.getByLabelText('Поиск штата'), { target: { value: 'new' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    fireEvent.click(screen.getByText('New York'));
    fireEvent.change(screen.getByLabelText('Поиск штата'), { target: { value: 'IL' } });
    fireEvent.click(screen.getByText('Illinois'));
    expect(screen.getByTestId('codes').textContent).toBe('NY,IL');
    fireEvent.click(screen.getByLabelText('Убрать NY'));
    expect(screen.getByTestId('codes').textContent).toBe('IL');
  });
});

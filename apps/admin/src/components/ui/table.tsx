import * as React from 'react';
import { cn } from '@/lib/utils';

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface shadow-card">
      <table
        className={cn(
          'w-full text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-2 [&_tbody_tr:last-child_td]:border-b-0',
          className,
        )}
        {...props}
      />
    </div>
  );
}

export function Th({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'sticky top-0 border-b border-line bg-surface-2/80 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-faint backdrop-blur',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('border-b border-line px-4 py-3 align-top', className)} {...props} />;
}

/** Row shown when a list is empty / loading inside a table body. */
export function TableEmpty({
  colSpan,
  loading,
  children,
}: {
  colSpan: number;
  loading?: boolean;
  children?: React.ReactNode;
}) {
  if (loading) {
    return (
      <>
        {Array.from({ length: 4 }).map((_, i) => (
          <tr key={i}>
            <td colSpan={colSpan} className="border-b border-line px-4 py-3">
              <div className="skeleton h-4 rounded-md" style={{ width: `${70 - i * 12}%` }} />
            </td>
          </tr>
        ))}
      </>
    );
  }
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-muted">
        {children ?? 'Пока пусто'}
      </td>
    </tr>
  );
}

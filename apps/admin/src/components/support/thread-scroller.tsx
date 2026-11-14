'use client';

import { ArrowDown } from '@phosphor-icons/react';
import { useEffect } from 'react';
import { useStickToBottom } from 'use-stick-to-bottom';
import { cn } from '@/lib/utils';

const HAS_RESIZE_OBSERVER = typeof ResizeObserver !== 'undefined';

/**
 * Detective D1-6 (13.11): the support conversation follows new messages
 * only while the agent is at the bottom. Scrolled up to read earlier
 * history, the view stays where it is and a «К последним сообщениям» button
 * (Telegram's «↓») brings it down. The logic is use-stick-to-bottom
 * (MIT, StackBlitz — the hook behind most AI-chat windows: a near-bottom
 * window, escape on a user scroll up, ResizeObserver, scroll anchoring),
 * used as is. [followKey] changes when the agent sends: the thread then
 * goes to the bottom like any messenger after «Отправить».
 */
export function ThreadScroller({
  className,
  followKey,
  testId,
  children,
}: {
  className?: string;
  followKey?: number;
  testId?: string;
  children: React.ReactNode;
}) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom({ initial: 'instant', resize: 'smooth' });
  useEffect(() => {
    if (followKey) void scrollToBottom();
  }, [followKey, scrollToBottom]);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className={cn('overflow-y-auto', className)} data-testid={testId}>
        {/* The hook watches the content with ResizeObserver; a browser without it
            (and jsdom in tests) keeps a plain scroll box instead of crashing. */}
        <div ref={HAS_RESIZE_OBSERVER ? contentRef : undefined} className="space-y-5">
          {children}
        </div>
      </div>
      {!isAtBottom ? (
        <button
          type="button"
          onClick={() => void scrollToBottom()}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-elevated px-3 py-1.5 text-xs font-medium text-ink shadow-pop hover:bg-surface-2"
          data-testid="thread-to-bottom"
        >
          <ArrowDown size={13} weight="bold" /> К последним сообщениям
        </button>
      ) : null}
    </div>
  );
}

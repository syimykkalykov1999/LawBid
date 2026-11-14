'use client';

/**
 * The two interceptors of next-navigation-guard 0.2.0 (MIT, Copyright (c)
 * 2024 LayerX Inc.; see THIRD_PARTY_NOTICES.md), from
 * github.com/LayerXcom/next-navigation-guard src/hooks/useInterceptPageUnload.ts
 * and src/hooks/useInterceptLinkClicks.ts. Detective D1-7 (13.11): a half-
 * written broadcast or template is not lost to a stray click or a reload.
 *
 * LawBid changes (marked «LawBid:»): one guard per hook call instead of the
 * provider's guard map (the admin never stacks two forms on a page); the
 * confirm is the synchronous `window.confirm`, so a «Да» lets the original
 * click go on (no programmatic re-navigation, no `window.next.router`); the
 * debug logging and the router-context probe are dropped (Next 16 is outside
 * the package's `next ^14 || ^15` peer range — only the DOM part is used).
 */

import { useEffect, useRef } from 'react';

/** What the browser shows is its own text; ours is for in-app link clicks. */
export const UNSAVED_TEXT = 'Есть несохранённые изменения. Уйти со страницы и потерять их?';

export function useNavigationGuard({
  enabled,
  confirm = () => window.confirm(UNSAVED_TEXT),
  links = true,
}: {
  enabled: boolean;
  confirm?: () => boolean;
  /** LawBid: false = only a reload / tab close asks (a text kept as a draft survives in-app links). */
  links?: boolean;
}) {
  // LawBid: the latest values without re-subscribing on every keystroke.
  const enabledRef = useRef(enabled);
  const confirmRef = useRef(confirm);
  useEffect(() => {
    enabledRef.current = enabled;
    confirmRef.current = confirm;
  });

  // useInterceptPageUnload
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!enabledRef.current) return;
      event.preventDefault();
      // As MDN says, custom message has already been unsupported in majority of browsers.
      // Chrome requires returnValue to be set.
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // useInterceptLinkClicks
  useEffect(() => {
    if (!links) return;
    const handleLinkClick = (e: MouseEvent) => {
      if (!enabledRef.current) return;
      const target = e.target as Element | null;
      const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute('href');
      if (!href) return;
      // Skip external links
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) return;
      // Skip hash links
      if (href.startsWith('#')) return;
      // Skip if it has a target attribute (opens in new window/tab)
      if (link.target && link.target !== '_self') return;
      // Skip if it's a download link
      if (link.hasAttribute('download')) return;
      // Check if modifier keys are pressed (Ctrl, Cmd, Shift, Alt)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      // Check if it's a middle click (open in new tab)
      if (e.button !== 0) return;
      // LawBid: a synchronous confirm — «OK» lets this click navigate as usual.
      if (confirmRef.current()) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    // Add event listener in capture phase to intercept before React
    document.addEventListener('click', handleLinkClick, true);
    return () => document.removeEventListener('click', handleLinkClick, true);
  }, [links]);
}

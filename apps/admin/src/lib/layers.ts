'use client';

import { useEffect, useRef } from 'react';

/**
 * «Esc closes only the top layer» — owner row 88 (2026-11-13).
 *
 * The rule and the key check are Radix UI's DismissableLayer and
 * useEscapeKeydown (MIT, Copyright (c) 2022 WorkOS; see THIRD_PARTY_NOTICES.md):
 * every open layer (dialog, menu, lightbox) is kept in opening order, only the
 * highest one reacts to Escape, the listener is on `document` in the capture
 * phase, and an Escape that belongs to an input method (IME composition,
 * keyCode 229) is ignored. Before this, each dialog listened on `window`, so
 * one Esc closed a menu, the dialog under it and the dialog under that.
 */

const stack: object[] = [];

export function useEscapeLayer(active: boolean, onEscape: () => void) {
  const cb = useRef(onEscape);
  useEffect(() => {
    cb.current = onEscape;
  });
  useEffect(() => {
    if (!active) return;
    const token = {};
    stack.push(token);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // An Escape during an IME composition belongs to the input method.
      if (event.isComposing || event.keyCode === 229) return;
      if (stack[stack.length - 1] !== token) return;
      event.preventDefault();
      cb.current();
    };
    document.addEventListener('keydown', onKey, { capture: true });
    return () => {
      document.removeEventListener('keydown', onKey, { capture: true });
      const i = stack.indexOf(token);
      if (i !== -1) stack.splice(i, 1);
    };
  }, [active]);
}

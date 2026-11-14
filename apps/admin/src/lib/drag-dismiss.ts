'use client';

import { animate, type MotionValue, useReducedMotion } from 'motion/react';
import { useCallback, useRef, useSyncExternalStore } from 'react';

/**
 * Drag-to-close for a sheet (pull down) or a side menu (swipe left).
 *
 * Owner row 88 (2026-11-13). The logic and numbers are vaul's
 * (github.com/emilkowalski/vaul src/index.tsx + constants.ts + helpers.ts,
 * MIT, Copyright (c) 2023 Emil Kowalski; see THIRD_PARTY_NOTICES.md). The
 * package itself says «This repo is unmaintained», so it is copied, not
 * installed. Copied as is: `onPress` / `shouldDrag` / `onDrag` / `onRelease`,
 * close on a flick faster than 0.4 px/ms or a drag past 25 % of the panel,
 * no drag in the first 500 ms after opening, no drag while a scrolled area
 * inside is not at its top (and for 100 ms after it was), no drag with
 * selected text or from a <select> / `[data-vaul-no-drag]`, the log damping
 * when pulled the wrong way, the snap-back curve 0.5 s [0.32, 0.72, 0, 1].
 *
 * LawBid changes: the offset goes into a motion value (vaul writes
 * `style.transform`), so the exit animation of AnimatePresence starts from
 * where the finger let go instead of jumping back first. vaul stops the
 * browser's own pull (scroll / rubber band) with react-aria's
 * `usePreventScroll`; here the same `touchmove` `preventDefault` is done only
 * while a drag is running (pointer events fire before touch events, so the
 * drag is decided first).
 */

export const SHEET_TRANSITION = { duration: 0.5, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] };
const VELOCITY_THRESHOLD = 0.4;
const CLOSE_THRESHOLD = 0.25;
const SCROLL_LOCK_TIMEOUT = 100;
const OPEN_GRACE_MS = 500;
const AXIS_SLOP = 10;

function dampenValue(v: number) {
  return 8 * (Math.log(v + 1) - 2);
}

type Direction = 'bottom' | 'left';

export function useDragDismiss({
  offset,
  direction,
  enabled,
  onClose,
  onProgress,
}: {
  /** The motion value bound to the panel's `y` (bottom) or `x` (left). */
  offset: MotionValue<number | string>;
  direction: Direction;
  enabled: boolean;
  onClose: () => void;
  /** 0 = fully open, 1 = closed; for the backdrop. */
  onProgress?: (p: number) => void;
}) {
  const reduced = useReducedMotion();
  const vertical = direction === 'bottom';
  const panel = useRef<HTMLElement | null>(null);
  const openTime = useRef(Date.now());
  const dragging = useRef(false);
  const allowed = useRef(false);
  const pointerStart = useRef(0);
  const crossStart = useRef(0);
  const startTime = useRef(0);
  const size = useRef(0);
  const lastTimeDragPrevented = useRef<number | null>(null);
  const current = useRef(0);
  const detach = useRef<(() => void) | null>(null);

  // A non-passive touchmove: once the drag owns the gesture, the browser may
  // not scroll or rubber-band the page under it.
  const ref = useCallback((node: HTMLElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!node) return;
    const onTouchMove = (e: TouchEvent) => {
      if (allowed.current && e.cancelable) e.preventDefault();
    };
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    detach.current = () => node.removeEventListener('touchmove', onTouchMove);
  }, []);

  // Positive = towards closing (down for a sheet, left for the side menu).
  const towardsClose = (e: React.PointerEvent) => (vertical ? e.pageY - pointerStart.current : pointerStart.current - e.pageX);

  function shouldDrag(el: EventTarget, isDraggingInDirection: boolean) {
    let element = el as HTMLElement | null;
    const highlightedText = window.getSelection()?.toString();
    const now = Date.now();

    if (element?.tagName === 'SELECT') return false;
    if (element?.closest?.('[data-vaul-no-drag]')) return false;
    if (!vertical) return true;
    // Allow scrolling when animating
    if (now - openTime.current < OPEN_GRACE_MS) return false;
    if (current.current > 0) return true;
    // Don't drag if there's highlighted text
    if (highlightedText && highlightedText.length > 0) return false;
    // Disallow dragging if drawer was scrolled within `scrollLockTimeout`
    if (lastTimeDragPrevented.current && now - lastTimeDragPrevented.current < SCROLL_LOCK_TIMEOUT && current.current === 0) {
      lastTimeDragPrevented.current = now;
      return false;
    }
    if (isDraggingInDirection) {
      // Dragging up (away from closing): that is a scroll.
      lastTimeDragPrevented.current = now;
      return false;
    }
    // Keep climbing up the DOM tree as long as there's a parent
    while (element) {
      if (element.scrollHeight > element.clientHeight) {
        if (element.scrollTop !== 0) {
          lastTimeDragPrevented.current = Date.now();
          // The element is scrollable and not scrolled to the top, so don't drag
          return false;
        }
        if (element.getAttribute('role') === 'dialog') return true;
      }
      if (element === panel.current) return true;
      element = element.parentElement;
    }
    return true;
  }

  function set(v: number) {
    current.current = v;
    offset.set(vertical ? v : -v);
    onProgress?.(size.current ? Math.min(1, Math.max(0, v / size.current)) : 0);
  }

  function onPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (!enabled) return;
    panel.current = e.currentTarget;
    const rect = e.currentTarget.getBoundingClientRect();
    size.current = vertical ? rect.height : rect.width;
    dragging.current = true;
    startTime.current = Date.now();
    pointerStart.current = vertical ? e.pageY : e.pageX;
    crossStart.current = vertical ? e.pageX : e.pageY;
    offset.stop();
    // Ensure we maintain correct pointer capture even when going outside of the drawer
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLElement>) {
    if (!dragging.current) return;
    const dragged = towardsClose(e);
    // vaul: «isDraggingInDirection» is towards opening further.
    const isDraggingInDirection = dragged < 0;
    if (!allowed.current && !vertical) {
      // Side menu: the first clear axis wins, so a vertical scroll of the
      // menu never turns into a swipe (Telegram Web A captureEvents idea,
      // GPL, own code: wait for 10 px, then the longer axis decides).
      const cross = Math.abs(e.pageY - crossStart.current);
      if (Math.abs(dragged) < AXIS_SLOP && cross < AXIS_SLOP) return;
      if (cross > Math.abs(dragged)) {
        dragging.current = false;
        return;
      }
    }
    if (!allowed.current && !shouldDrag(e.target, isDraggingInDirection)) return;
    allowed.current = true;
    if (isDraggingInDirection) {
      // Pulled the wrong way: a little, damped (vaul dampenValue).
      set(Math.min(-dampenValue(-dragged), 0));
      return;
    }
    set(dragged);
  }

  function onPointerUp(e: React.PointerEvent<HTMLElement>) {
    if (!dragging.current) return;
    dragging.current = false;
    const wasAllowed = allowed.current;
    allowed.current = false;
    const swipeAmount = current.current;
    if (!wasAllowed || !swipeAmount) return;
    const timeTaken = Math.max(1, Date.now() - startTime.current);
    const distMoved = towardsClose(e);
    const velocity = Math.abs(distMoved) / timeTaken;
    // Moved back towards open: don't close.
    if (distMoved <= 0) return reset();
    if (velocity > VELOCITY_THRESHOLD) return onClose();
    const visible = vertical ? Math.min(size.current, window.innerHeight) : Math.min(size.current, window.innerWidth);
    if (Math.abs(swipeAmount) >= visible * CLOSE_THRESHOLD) return onClose();
    reset();
  }

  function reset() {
    current.current = 0;
    onProgress?.(0);
    if (reduced) offset.set(0);
    else animate(offset, 0, SHEET_TRANSITION);
  }

  /** Call when the panel opens (vaul `openTime`). */
  const markOpened = () => {
    openTime.current = Date.now();
    current.current = 0;
  };

  return {
    ref,
    markOpened,
    handlers: enabled
      ? { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
      : {},
  };
}

/** `true` while the media query matches (phones: the sheet / drawer widths). */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener?.('change', cb);
      return () => mq.removeEventListener?.('change', cb);
    },
    () => (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches),
    () => false,
  );
}

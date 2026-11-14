/**
 * Page scroll lock for open dialogs, without the sideways jump.
 *
 * Owner row 88 (2026-11-13). The gap measurement is react-remove-scroll-bar's
 * `getGapWidth` (MIT, Copyright (c) 2025 Anton Korzunov; see
 * THIRD_PARTY_NOTICES.md), copied as is: when `overflow: hidden` removes the
 * page scrollbar (Windows, Linux, macOS with «always show scroll bars»), the
 * body gets the same width back as padding, so nothing behind the dialog moves.
 * The body rule is its `body[data-scroll-locked]` style (`padding` gap mode).
 * One lock for all open dialogs: the first one locks, the last one unlocks
 * (react-remove-scroll keeps the same stack), so a dialog opened from a dialog
 * does not unlock the page when it closes.
 */

type GapMode = 'padding' | 'margin';

interface GapOffset {
  left: number;
  top: number;
  right: number;
  gap: number;
}

const zeroGap = { left: 0, top: 0, right: 0, gap: 0 };

const parse = (x: string | null) => parseInt(x || '', 10) || 0;

const getOffset = (gapMode: GapMode): number[] => {
  const cs = window.getComputedStyle(document.body);

  const left = cs[gapMode === 'padding' ? 'paddingLeft' : 'marginLeft'];
  const top = cs[gapMode === 'padding' ? 'paddingTop' : 'marginTop'];
  const right = cs[gapMode === 'padding' ? 'paddingRight' : 'marginRight'];

  return [parse(left), parse(top), parse(right)];
};

export const getGapWidth = (gapMode: GapMode = 'margin'): GapOffset => {
  if (typeof window === 'undefined') {
    return zeroGap;
  }

  const offsets = getOffset(gapMode);
  const documentWidth = document.documentElement.clientWidth;
  const windowWidth = window.innerWidth;

  return {
    left: offsets[0],
    top: offsets[1],
    right: offsets[2],
    gap: Math.max(0, windowWidth - documentWidth + offsets[2] - offsets[0]),
  };
};

/** Attribute set on <body> while locked (react-remove-scroll-bar's name). */
export const lockAttribute = 'data-scroll-locked';

let locks = 0;
let restore: (() => void) | null = null;

/** Locks page scroll until the returned function is called. */
export function lockScroll(): () => void {
  if (locks++ === 0) {
    const body = document.body;
    const { gap, right } = getGapWidth('padding');
    const prev = { overflow: body.style.overflow, paddingRight: body.style.paddingRight, overscroll: body.style.overscrollBehavior };
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'contain';
    // `gap` already holds the body's own right padding (react-remove-scroll-bar).
    if (gap > right) body.style.paddingRight = `${gap}px`;
    body.setAttribute(lockAttribute, String(locks));
    restore = () => {
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.paddingRight;
      body.style.overscrollBehavior = prev.overscroll;
      body.removeAttribute(lockAttribute);
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--locks === 0) {
      restore?.();
      restore = null;
    }
  };
}

'use client';

import { ArrowClockwise, ArrowCounterClockwise, CaretLeft, CaretRight, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LazyImg } from '@/components/ui/lazy-img';

export interface LightboxImage {
  src: string;
  alt: string;
  /** A PDF is shown in a frame inside the lightbox (no zoom). */
  kind?: 'image' | 'pdf';
  /** The server's 320 / 1080 px copies, when it made them (LazyImg srcset). */
  sources?: { url: string; previewUrl?: string | null; mediumUrl?: string | null } | null;
  /** Drawn until the picture loads. */
  blurhash?: string | null;
}

const FOCUSABLE = 'a[href], button:not([disabled]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const MIN = 1;
const MAX = 6;
const STEP = 1.25;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/*
 * Detective D1-9 (13.11): gesture maths copied from two MIT libraries.
 * react-zoom-pan-pinch 4.2.0 (Copyright (c) 2019 prc5; THIRD_PARTY_NOTICES):
 *  - wheel: `targetScale = scale + delta * step`, with `step * |deltaY|` in
 *    its default `smooth` mode, `delta = deltaY < 0 ? 1 : -1`, step 0.015,
 *    and a wheel with deltaY 0 is no zoom (core/wheel/wheel.utils.ts,
 *    wheel.logic.ts, constants/state.constants.ts) — a trackpad scroll that
 *    sends dozens of small events now zooms gradually, not straight to 600 %;
 *  - pinch: `rawScale = currentDistance / startDistance * startScale`
 *    (core/pinch/pinch.utils.ts, default step = DEFAULT_PINCH_STEP, so the
 *    proportion is used as is), zoom about the point under the cursor /
 *    between the fingers (core/zoom/zoom.utils.ts handleCalculateZoomPositions,
 *    rewritten for our centre transform origin).
 * PhotoSwipe 5.4.4 (Copyright (c) 2014-2022 Dmitry Semenov; THIRD_PARTY_NOTICES),
 * gestures/drag-handler.js: a swipe goes to the next / previous picture when
 * its speed is over MIN_NEXT_SLIDE_SPEED (0.5 px/ms) in that direction, or
 * when it moved over half the width and has nearly stopped (< 0.1 px/ms).
 */
const WHEEL_STEP = 0.015;
const MIN_NEXT_SLIDE_SPEED = 0.5;

/** The pan that keeps the screen point [s] still when the zoom goes z → n (centre origin). */
export function panAbout(s: { x: number; y: number }, c: { x: number; y: number }, pan: { x: number; y: number }, z: number, n: number) {
  const k = n / z;
  return { x: s.x - c.x - k * (s.x - c.x - pan.x), y: s.y - c.y - k * (s.y - c.y - pan.y) };
}

/** The wheel zoom of react-zoom-pan-pinch (smooth mode), clamped to our range. */
export function wheelZoom(z: number, deltaY: number): number {
  if (deltaY === 0) return z;
  const delta = deltaY < 0 ? 1 : -1;
  return clamp(z + delta * WHEEL_STEP * Math.abs(deltaY));
}

/** PhotoSwipe's next-slide rule: +1 next, −1 previous, 0 stay. */
export function swipeStep(dx: number, ms: number, width: number): -1 | 0 | 1 {
  const velocity = ms > 0 ? dx / ms : 0;
  const ratio = width > 0 ? dx / width : 0;
  if ((velocity < -MIN_NEXT_SLIDE_SPEED && ratio < 0) || (velocity < 0.1 && ratio < -0.5)) return 1;
  if ((velocity > MIN_NEXT_SLIDE_SPEED && ratio > 0) || (velocity > -0.1 && ratio > 0.5)) return -1;
  return 0;
}

/**
 * Owner 2026-10-28: a picture of the review screen opened full-screen.
 * The image fits any monitor (object-contain inside the viewport); zoom by
 * the wheel, the buttons, +/− or a double click; drag to move a zoomed
 * picture; ← / → between the pictures of the item; Esc or the backdrop
 * closes. Nothing is loaded here: it shows the links the screen already has.
 *
 * Owner 2026-11-04 (R-393): a counter «2 из 4» with the document name,
 * «Назад / Вперёд» at the bottom besides the side arrows, PDFs in a frame.
 * Focus stays inside while open (the WAI-ARIA APG modal dialog pattern: Tab
 * wraps, focus starts on «Закрыть» and returns to the opener on close) and
 * the page under it does not scroll.
 *
 * Owner 2026-11-04 (R-400): [lastSlide] — controls shown only under the last
 * document (the registry button and the copy chips of the conveyor), so the
 * verifier reaches the registry right after the last picture.
 *
 * Scout 13.11 (row 96): «Повернуть» and the R key turn the picture by 90°
 * (Shift+R the other way), as the Persona and Onfido review screens and
 * react-photo-view (MIT, `rotate`) do — a photo of a licence taken sideways
 * is read without tilting the head. Another picture starts upright.
 */
export function Lightbox({ images, index, onIndex, onClose, lastSlide }: { images: readonly LightboxImage[]; index: number; onIndex: (i: number) => void; onClose: () => void; lastSlide?: React.ReactNode }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [rotate, setRotate] = useState(0);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  // D1-9: the fingers on the stage, a pinch in progress and a swipe in progress.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number; pan: { x: number; y: number } } | null>(null);
  const swipe = useRef<{ x: number; t: number; dx: number } | null>(null);
  const [swipeX, setSwipeX] = useState(0);
  const stage = useRef<HTMLDivElement>(null);
  // The latest zoom / pan for the native wheel listener.
  const view = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  view.current = { zoom, pan };
  const root = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const count = images.length;
  const img = images[index];
  const pdf = img?.kind === 'pdf';

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);
  const go = useCallback(
    (d: number) => {
      if (count < 2) return;
      reset();
      setRotate(0);
      onIndex((index + d + count) % count);
    },
    [count, index, onIndex, reset],
  );
  const zoomBy = useCallback((f: number) => {
    setZoom((z) => {
      const n = clamp(z * f);
      if (n === 1) setPan({ x: 0, y: 0 });
      return n;
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') zoomBy(STEP);
      else if (e.key === '-' || e.key === '_') zoomBy(1 / STEP);
      else if (e.key === '0') reset();
      else if ((e.key === 'r' || e.key === 'R' || e.code === 'KeyR') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (pdf) return;
        setRotate((d) => d + (e.shiftKey ? -90 : 90));
      }
      else if (e.key === 'Tab') {
        const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (!first || !last) return;
        const inside = root.current?.contains(document.activeElement);
        if (e.shiftKey && (document.activeElement === first || !inside)) last.focus();
        else if (!e.shiftKey && (document.activeElement === last || !inside)) first.focus();
        else return;
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onClose, pdf, reset, zoomBy]);

  // D1-9: zoom to a point (the cursor, the middle between two fingers).
  const zoomAt = useCallback((n: number, sx: number, sy: number) => {
    const el = stage.current;
    const { zoom: z, pan: p } = view.current;
    const next = clamp(n);
    if (next === z) return;
    if (next === 1 || !el) {
      setZoom(next);
      setPan({ x: 0, y: 0 });
      return;
    }
    const r = el.getBoundingClientRect();
    setZoom(next);
    setPan(panAbout({ x: sx, y: sy }, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, p, z, next));
  }, []);

  // The wheel listener is native and not passive: Ctrl+wheel (a trackpad
  // pinch on a Mac) must zoom the picture, not the whole page.
  useEffect(() => {
    const el = stage.current;
    if (!el || pdf) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      zoomAt(wheelZoom(view.current.zoom, e.deltaY), e.clientX, e.clientY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [pdf, zoomAt]);

  // Scroll lock and focus: set once while open, given back on close.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);

  if (!img || typeof document === 'undefined') return null;

  return createPortal(
    <div ref={root} role="dialog" aria-modal aria-label={img.alt} className="fixed inset-0 z-[70] flex flex-col bg-[#05060a]/90 backdrop-blur-[6px]" data-testid="lightbox">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-sm text-white">
        <span className="min-w-0 flex-1 truncate">
          {count > 1 ? (
            <span className="mr-2 tabular-nums opacity-70" data-testid="lightbox-counter">
              {index + 1} из {count}
            </span>
          ) : null}
          <span data-testid="lightbox-title">{img.alt}</span>
        </span>
        {pdf ? null : (
          <>
            <IconButton label="Уменьшить" onClick={() => zoomBy(1 / STEP)}>
              <MagnifyingGlassMinus size={18} />
            </IconButton>
            <span className="w-12 text-center tabular-nums opacity-80">{Math.round(zoom * 100)}%</span>
            <IconButton label="Увеличить" onClick={() => zoomBy(STEP)}>
              <MagnifyingGlassPlus size={18} />
            </IconButton>
            <IconButton label="Сбросить масштаб" onClick={reset}>
              <ArrowCounterClockwise size={18} />
            </IconButton>
            <IconButton label="Повернуть на 90° (R)" onClick={() => setRotate((d) => d + 90)}>
              <ArrowClockwise size={18} />
            </IconButton>
          </>
        )}
        <IconButton ref={closeRef} label="Закрыть" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div
        ref={stage}
        className="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget && zoom === 1) onClose();
        }}
        onPointerDown={(e) => {
          if (pdf) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const pts = [...pointers.current.values()];
          if (pts.length === 2) {
            // Two fingers: a pinch, no drag or swipe.
            const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
            pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, pan };
            drag.current = null;
            swipe.current = null;
            setSwipeX(0);
            return;
          }
          if (zoom > 1) drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          else if (e.pointerType !== 'mouse' && count > 1) swipe.current = { x: e.clientX, t: e.timeStamp, dx: 0 };
        }}
        onPointerMove={(e) => {
          if (!pointers.current.has(e.pointerId)) return;
          pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
          const pz = pinch.current;
          if (pz && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()] as [{ x: number; y: number }, { x: number; y: number }];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (pz.dist > 0) {
              view.current = { zoom: pz.zoom, pan: pz.pan };
              zoomAt((dist / pz.dist) * pz.zoom, (a.x + b.x) / 2, (a.y + b.y) / 2);
            }
            return;
          }
          const d = drag.current;
          if (d) setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
          const sw = swipe.current;
          if (sw) {
            sw.dx = e.clientX - sw.x;
            setSwipeX(sw.dx);
          }
        }}
        onPointerUp={(e) => {
          pointers.current.delete(e.pointerId);
          if (pointers.current.size < 2) pinch.current = null;
          drag.current = null;
          const sw = swipe.current;
          swipe.current = null;
          setSwipeX(0);
          if (sw) {
            const step = swipeStep(sw.dx, e.timeStamp - sw.t, e.currentTarget.clientWidth);
            if (step) go(step);
          }
        }}
        onPointerCancel={(e) => {
          pointers.current.delete(e.pointerId);
          pinch.current = null;
          drag.current = null;
          swipe.current = null;
          setSwipeX(0);
        }}
      >
        {pdf ? (
          <iframe key={img.src} src={img.src} title={img.alt} className="absolute inset-y-2 left-16 right-16 h-[calc(100%-1rem)] w-[calc(100%-8rem)] rounded-lg bg-white" />
        ) : (
          <LazyImg
            src={img.src}
            sources={img.sources}
            sizes="100vw"
            blurhash={img.blurhash}
            alt={img.alt}
            draggable={false}
            onDoubleClick={() => (zoom === 1 ? setZoom(2.5) : reset())}
            className="absolute inset-0 m-auto max-h-full max-w-full object-contain p-2 transition-transform duration-75"
            data-rotate={((rotate % 360) + 360) % 360}
            style={{ transform: `translate(${pan.x + swipeX}px, ${pan.y}px) rotate(${rotate}deg) scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
          />
        )}
        {count > 1 ? (
          <>
            <NavButton side="left" label="Предыдущее" onClick={() => go(-1)}>
              <CaretLeft size={22} weight="bold" />
            </NavButton>
            <NavButton side="right" label="Следующее" onClick={() => go(1)}>
              <CaretRight size={22} weight="bold" />
            </NavButton>
          </>
        ) : null}
      </div>
      {count > 1 ? (
        <div className="flex shrink-0 items-center justify-center gap-3 pt-1 pb-2">
          <BottomButton onClick={() => go(-1)}>
            <CaretLeft size={16} weight="bold" /> Назад
          </BottomButton>
          <BottomButton onClick={() => go(1)}>
            Вперёд <CaretRight size={16} weight="bold" />
          </BottomButton>
        </div>
      ) : null}
      {lastSlide && index === count - 1 ? (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 pb-2" data-testid="lightbox-last-slide">
          {lastSlide}
        </div>
      ) : null}
      <p className="shrink-0 pb-2 text-center text-xs text-white/70">
        {pdf ? '' : 'Колесо, щипок или +/− — масштаб · R — повернуть · перетаскивание — сдвиг · '}← → или свайп — листать · Esc — закрыть
      </p>
    </div>,
    document.body,
  );
}

function IconButton({ label, onClick, children, ref }: { label: string; onClick: () => void; children: React.ReactNode; ref?: React.Ref<HTMLButtonElement> }) {
  return (
    <button ref={ref} type="button" aria-label={label} title={label} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/15">
      {children}
    </button>
  );
}

function NavButton({ side, label, onClick, children }: { side: 'left' | 'right'; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={`absolute top-1/2 -translate-y-1/2 ${side === 'left' ? 'left-2' : 'right-2'} grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20`}
    >
      {children}
    </button>
  );
}

function BottomButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-medium text-white hover:bg-white/20">
      {children}
    </button>
  );
}

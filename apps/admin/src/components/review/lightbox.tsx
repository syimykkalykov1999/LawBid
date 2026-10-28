'use client';

import { ArrowCounterClockwise, CaretLeft, CaretRight, MagnifyingGlassMinus, MagnifyingGlassPlus, X } from '@phosphor-icons/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface LightboxImage {
  src: string;
  alt: string;
}

const MIN = 1;
const MAX = 6;
const STEP = 1.25;

const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/**
 * Owner 2026-10-28: a picture of the review screen opened full-screen.
 * The image fits any monitor (object-contain inside the viewport); zoom by
 * the wheel, the buttons, +/− or a double click; drag to move a zoomed
 * picture; ← / → between the pictures of the item; Esc or the backdrop
 * closes. Nothing is loaded here: it shows the links the screen already has.
 */
export function Lightbox({ images, index, onIndex, onClose }: { images: readonly LightboxImage[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const count = images.length;
  const img = images[index];

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);
  const go = useCallback(
    (d: number) => {
      if (count < 2) return;
      reset();
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
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prev;
    };
  }, [go, onClose, reset, zoomBy]);

  if (!img || typeof document === 'undefined') return null;

  return createPortal(
    <div role="dialog" aria-modal aria-label={img.alt} className="fixed inset-0 z-[70] flex flex-col bg-[#05060a]/90 backdrop-blur-[6px]" data-testid="lightbox">
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 text-sm text-white">
        <span className="min-w-0 flex-1 truncate">
          {img.alt}
          {count > 1 ? <span className="ml-2 opacity-70">{index + 1} / {count}</span> : null}
        </span>
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
        <IconButton label="Закрыть" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <div
        className="relative min-h-0 flex-1 touch-none overflow-hidden select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget && zoom === 1) onClose();
        }}
        onWheel={(e) => zoomBy(e.deltaY < 0 ? STEP : 1 / STEP)}
        onPointerDown={(e) => {
          if (zoom === 1) return;
          drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a short signed link, not a static asset */}
        <img
          src={img.src}
          alt={img.alt}
          draggable={false}
          onDoubleClick={() => (zoom === 1 ? setZoom(2.5) : reset())}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain p-2 transition-transform duration-75"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'zoom-in' }}
        />
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
      <p className="shrink-0 pb-2 text-center text-xs text-white/70">Колесо или +/− — масштаб · перетаскивание — сдвиг · ← → — листать · Esc — закрыть</p>
    </div>,
    document.body,
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="grid h-9 w-9 place-items-center rounded-full text-white hover:bg-white/15">
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

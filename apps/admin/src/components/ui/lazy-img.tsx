'use client';

import { decode } from 'blurhash';
import { useMemo, useState, type ImgHTMLAttributes } from 'react';

/**
 * Speed matrix 2026-11-09 (§3 #3, «картинки модерации и верификации —
 * оригиналы»): the one <img> of the admin. It always loads lazily and
 * decodes off the main thread (`loading="lazy" decoding="async"`, built
 * into the browser), takes the 320 / 1080 px copies the server already
 * makes as a `srcset` so the browser downloads the size it will draw, and
 * shows the blurhash the server stored as the picture's own background
 * until the real bytes arrive (the `blurhash` decoder, MIT, as the app's
 * R-248 does). Same element, same classes: the look does not change.
 */
export interface ImageSources {
  url: string;
  previewUrl?: string | null;
  mediumUrl?: string | null;
}

/** Widths the server's copies have (files.policy.ts POST_IMAGE_VARIANT_PX,
 * main ≤ 2048). */
const PREVIEW_W = 320;
const MEDIUM_W = 1080;
const MAIN_W = 2048;

/** `srcset` of the copies that exist, or undefined when only the original does. */
export function srcSetOf(s: ImageSources | null | undefined): string | undefined {
  if (!s) return undefined;
  const parts: string[] = [];
  if (s.previewUrl && s.previewUrl !== s.url) parts.push(`${s.previewUrl} ${PREVIEW_W}w`);
  if (s.mediumUrl && s.mediumUrl !== s.url) parts.push(`${s.mediumUrl} ${MEDIUM_W}w`);
  if (parts.length === 0) return undefined;
  parts.push(`${s.url} ${MAIN_W}w`);
  return parts.join(', ');
}

/** The blurhash as a tiny PNG data URL (null where there is no canvas, e.g. SSR / tests). */
export function blurhashDataUrl(hash: string, w = 32, h = 32): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const pixels = decode(hash, w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const image = ctx.createImageData(w, h);
    image.data.set(pixels);
    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL();
  } catch {
    return null;
  }
}

export type LazyImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet' | 'alt'> & {
  src: string;
  /** Always given: a caption, or '' for a decorative picture. */
  alt: string;
  /** The server's copies; `srcset` is built from them. */
  sources?: ImageSources | null;
  /** Shown as the background until the picture has loaded. */
  blurhash?: string | null;
};

export function LazyImg({ src, alt, sources, blurhash, sizes, style, onLoad, ...rest }: LazyImgProps) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = useMemo(() => (blurhash && !loaded ? blurhashDataUrl(blurhash) : null), [blurhash, loaded]);
  const srcSet = srcSetOf(sources ? { ...sources, url: src } : null);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- short signed links, not static assets
    <img
      {...rest}
      alt={alt}
      src={src}
      srcSet={srcSet}
      sizes={srcSet ? (sizes ?? 'auto') : sizes}
      loading="lazy"
      decoding="async"
      style={
        placeholder
          ? { ...style, backgroundImage: `url(${placeholder})`, backgroundSize: 'cover', backgroundPosition: 'center' }
          : style
      }
      onLoad={(e) => {
        setLoaded(true);
        onLoad?.(e);
      }}
    />
  );
}

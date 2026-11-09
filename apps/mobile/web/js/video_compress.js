// Owner 2026-11-08 (approved MPL-2.0 exception): a video picked in the
// browser is re-encoded before upload with Mediabunny 1.62.1, used
// unmodified from ../vendor/mediabunny-1.62.1/ (MPL-2.0, see
// THIRD_PARTY_NOTICES.md). Loaded only when a video is sent, so the first
// page load does not grow. A browser without WebCodecs, or any failure,
// answers null and the original is uploaded.
let lib;
let running;

export function supported() {
  return typeof VideoEncoder !== 'undefined' &&
    typeof VideoDecoder !== 'undefined';
}

/** [url]: the picked file's blob: link. Returns the smaller MP4 as a Blob,
 * or null (keep the original). */
export async function compress(url, maxShortSide, frameRate, onProgress) {
  if (!supported()) return null;
  lib ??= await import('../vendor/mediabunny-1.62.1/mediabunny.min.js');
  const m = lib;
  const source = await (await fetch(url)).blob();
  const input = new m.Input({
    source: new m.BlobSource(source),
    formats: m.ALL_FORMATS,
  });
  const target = new m.BufferTarget();
  const output = new m.Output({
    format: new m.Mp4OutputFormat({ fastStart: 'in-memory' }),
    target,
  });
  const conversion = await m.Conversion.init({
    input,
    output,
    video: (track) => {
      const w = track.displayWidth;
      const h = track.displayHeight;
      const size = !(maxShortSide > 0) || Math.min(w, h) <= maxShortSide
        ? {}
        : w <= h ? { width: maxShortSide } : { height: maxShortSide };
      return { ...size, codec: 'avc', frameRate, quality: m.QUALITY_HIGH };
    },
    audio: { codec: 'aac' },
    showWarnings: false,
  });
  // A track the browser cannot re-encode (AAC audio is missing in some
  // browsers) would be dropped: then the original goes up instead, never a
  // video without its sound.
  if (!conversion.isValid || conversion.discardedTracks.length > 0) {
    return null;
  }
  running = conversion;
  conversion.onProgress = (p) => onProgress?.(p);
  try {
    await conversion.execute();
  } finally {
    running = undefined;
  }
  const out = target.buffer;
  if (!out || out.byteLength >= source.size) return null;
  return new Blob([out], { type: 'video/mp4' });
}

export async function cancel() {
  await running?.cancel();
}

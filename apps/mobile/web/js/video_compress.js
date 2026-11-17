// Owner 2026-11-08 (approved MPL-2.0 exception): a video picked in the
// browser is re-encoded before upload with Mediabunny 1.65.2, used
// unmodified from ../vendor/mediabunny-1.65.2/ (MPL-2.0, see
// THIRD_PARTY_NOTICES.md). Loaded only when a video is sent, so the first
// page load does not grow. A browser without WebCodecs, or any failure,
// answers null and the original is uploaded.
//
// Owner rows 101/102 (13.11): the output is written with
// `fastStart: 'reserve'` (the moov box is reserved at the start and the
// media goes straight into the output, instead of 'in-memory' keeping
// every chunk until the end: half the memory, no tab crash on a long
// video; Conversion estimates the packet count itself since 1.65); the
// bitrate is the admin's (`media.video_bitrate_*_kbps`, the phones' number)
// and never above the source's; an H.264, SDR source that is already no
// taller, no faster and no heavier than that is kept as it is.
let lib;
let running;

export function supported() {
  return typeof VideoEncoder !== 'undefined' &&
    typeof VideoDecoder !== 'undefined';
}

/** [url]: the picked file's blob: link. Returns the smaller MP4 as a Blob,
 * or null (keep the original). */
export async function compress(
  url, maxShortSide, frameRate, bitrateKbps, onProgress,
) {
  if (!supported()) return null;
  lib ??= await import('../vendor/mediabunny-1.65.2/mediabunny.min.js');
  const m = lib;
  const source = await (await fetch(url)).blob();
  const input = new m.Input({
    source: new m.BlobSource(source),
    formats: m.ALL_FORMATS,
  });
  const track = await input.getPrimaryVideoTrack();
  if (!track) return null;
  const w = await track.getDisplayWidth();
  const h = await track.getDisplayHeight();
  const shorter = !(maxShortSide > 0) || Math.min(w, h) <= maxShortSide;
  const stats = await track.computePacketStats(300);
  const srcBitrate = stats.averageBitrate || 0;
  if (
    shorter &&
    (await track.getCodec()) === 'avc' &&
    !(await track.hasHighDynamicRange()) &&
    stats.averagePacketRate <= frameRate + 0.5 &&
    srcBitrate > 0 && srcBitrate <= bitrateKbps * 1000
  ) {
    // Media check 14.11: a light H.264 file is kept — but one whose moov
    // box sits after the media (a camera / screen recorder writes it last)
    // makes the player fetch the end of the file before the first frame.
    // Such a file is only re-muxed: the same packets, moov first (no
    // second encode, Mediabunny copies tracks it does not have to change).
    if (await moovFirst(source)) return null;
    return remux(m, input, onProgress);
  }
  const bitrate = targetBitrate(bitrateKbps, srcBitrate);
  const buffer = new m.BufferTarget();
  const output = new m.Output({
    format: new m.Mp4OutputFormat({ fastStart: 'reserve' }),
    target: buffer,
  });
  const conversion = await m.Conversion.init({
    input,
    output,
    video: () => {
      const size = shorter
        ? {}
        : w <= h ? { width: maxShortSide } : { height: maxShortSide };
      return {
        ...size,
        codec: 'avc',
        frameRate: Math.min(frameRate, stats.averagePacketRate || frameRate),
        quality: new m.Quality({ bitrate }),
      };
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
  const out = buffer.buffer;
  if (!out || out.byteLength >= source.size) return null;
  return new Blob([out], { type: 'video/mp4' });
}

/** The file name of a re-muxed (not re-encoded) result: the app keeps it
 * although it is not smaller than the original. */
export const FAST_START_NAME = 'faststart.mp4';

/** Tracks copied into an MP4 with the moov box first, or null. */
async function remux(m, input, onProgress) {
  const buffer = new m.BufferTarget();
  const conversion = await m.Conversion.init({
    input,
    output: new m.Output({
      format: new m.Mp4OutputFormat({ fastStart: 'reserve' }),
      target: buffer,
    }),
    showWarnings: false,
  });
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
  const out = buffer.buffer;
  if (!out || out.byteLength === 0 || !(await moovFirst(new Blob([out])))) {
    return null;
  }
  return new File([out], FAST_START_NAME, { type: 'video/mp4' });
}

/**
 * Media check 14.11: the encoder's bit/s — the admin's number, never above
 * the source's own. WebCodecs (and Mediabunny's Quality) take only a
 * positive integer: the measured average bitrate is fractional, and before
 * every such source (VP9, HEVC, a taller or faster light H.264) threw
 * «options.bitrate … must be a positive integer» and went up uncompressed.
 */
export function targetBitrate(bitrateKbps, srcBitrate) {
  const target = Math.round(bitrateKbps * 1000);
  const b = srcBitrate > 0 ? Math.min(target, srcBitrate) : target;
  return Math.max(1, Math.round(b));
}

/**
 * Whether the ISO-BMFF top-level `moov` box comes before `mdat` (fast
 * start). Reads only the 16-byte box headers through Blob.slice, so a
 * large file is never loaded. False when not found (not MP4 / broken).
 */
export async function moovFirst(blob) {
  let off = 0;
  for (let i = 0; i < 1000 && off + 8 <= blob.size; i += 1) {
    const h = new DataView(
      await blob.slice(off, Math.min(blob.size, off + 16)).arrayBuffer(),
    );
    let size = h.getUint32(0);
    const type = String.fromCharCode(
      h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7),
    );
    if (type === 'moov') return true;
    if (type === 'mdat') return false;
    if (size === 1) {
      if (h.byteLength < 16) return false;
      size = Number(h.getBigUint64(8));
    } else if (size === 0) {
      return false;
    }
    if (size < 8) return false;
    off += size;
  }
  return false;
}

export async function cancel() {
  await running?.cancel();
}

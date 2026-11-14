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
  const target = bitrateKbps * 1000;
  const srcBitrate = stats.averageBitrate || 0;
  if (
    shorter &&
    (await track.getCodec()) === 'avc' &&
    !(await track.hasHighDynamicRange()) &&
    stats.averagePacketRate <= frameRate + 0.5 &&
    srcBitrate > 0 && srcBitrate <= target
  ) {
    return null;
  }
  const bitrate = srcBitrate > 0 ? Math.min(target, srcBitrate) : target;
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

export async function cancel() {
  await running?.cancel();
}

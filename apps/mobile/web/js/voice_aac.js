// Owner rows 101/102 (13.11): a voice note recorded in Chrome / Firefox comes
// out as Opus in WebM (MediaRecorder has no AAC there), and the iPhone app
// cannot play WebM. When the browser's own WebCodecs can encode AAC
// (Chrome, Edge and Safari on macOS / Windows), the note is converted to
// AAC in MP4 (.m4a, what the phones record) with Mediabunny 1.65.2, used
// unmodified from ../vendor/mediabunny-1.65.2/ (MPL-2.0, owner exception
// 08.11, see THIRD_PARTY_NOTICES.md). Where it cannot (Firefox, Linux), or
// on any failure, null is returned and the WebM note goes up as before.
let lib;

/** [url]: the recording's blob: link. Returns the AAC/MP4 note as a Blob,
 * or null (keep the original). [bitrate] bit/s and [sampleRate] Hz are the
 * admin's (`media.voice_bitrate_kbps`, `media.voice_sample_rate_hz`). */
export async function toAac(url, bitrate, sampleRate) {
  if (typeof AudioEncoder === 'undefined') return null;
  lib ??= await import('../vendor/mediabunny-1.65.2/mediabunny.min.js');
  const m = lib;
  if (!(await m.canEncodeAudio('aac'))) return null;
  const source = await (await fetch(url)).blob();
  // The admin's numbers when the browser's encoder takes them. Chrome's AAC
  // encoder (macOS, Windows) takes only 44.1 / 48 kHz, where 32 kbit/s
  // sounds worse than the Opus original: then Mediabunny's own 'low' level
  // at the input's rate (measured 13.11 in Chrome: ≈ 43 kbit/s mono at
  // 48 kHz, so 15 minutes still fit the 10 MiB voice limit).
  const own = await m.canEncodeAudio('aac', {
    numberOfChannels: 1,
    sampleRate,
    bitrate,
  });
  const tries = own
    ? [{ quality: new m.Quality({ bitrate }), sampleRate }]
    : [];
  tries.push({ quality: new m.Quality('low') });
  for (const audio of tries) {
    const buffer = new m.BufferTarget();
    const conversion = await m.Conversion.init({
      input: new m.Input({
        source: new m.BlobSource(source),
        formats: m.ALL_FORMATS,
      }),
      output: new m.Output({
        // A note is small: the whole file stays in memory anyway.
        format: new m.Mp4OutputFormat({ fastStart: 'in-memory' }),
        target: buffer,
      }),
      audio: { ...audio, codec: 'aac', numberOfChannels: 1 },
      showWarnings: false,
    });
    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      continue;
    }
    try {
      await conversion.execute();
    } catch (_) {
      continue;
    }
    const out = buffer.buffer;
    if (out && out.byteLength > 0) {
      return new Blob([out], { type: 'audio/mp4' });
    }
  }
  return null;
}

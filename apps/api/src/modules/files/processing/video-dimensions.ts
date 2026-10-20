/**
 * Owner 2026-10-18: the size of an MP4 / MOV video as it is shown, read
 * from its `tkhd` (track header) box — so the app draws a chat video
 * bubble at the right shape before the video loads (no jump). Rotated
 * phone videos store landscape sizes plus a 90° matrix: the shown size is
 * swapped then. Returns null when no video track header is found (e.g.
 * the `moov` box sits beyond [buf]).
 */
export function videoDimensions(
  buf: Buffer,
): { width: number; height: number } | null {
  const tracks: { width: number; height: number; rotated: boolean }[] = [];
  walk(buf, 0, buf.length, 0, tracks);
  const video = tracks.find((t) => t.width > 0 && t.height > 0);
  if (!video) return null;
  return video.rotated
    ? { width: video.height, height: video.width }
    : { width: video.width, height: video.height };
}

const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'edts']);

function walk(
  b: Buffer,
  start: number,
  end: number,
  depth: number,
  out: { width: number; height: number; rotated: boolean }[],
): void {
  let off = start;
  while (off + 8 <= end && depth < 6) {
    let size = b.readUInt32BE(off);
    const type = b.toString('latin1', off + 4, off + 8);
    let header = 8;
    if (size === 1) {
      if (off + 16 > end) return;
      const big = b.readBigUInt64BE(off + 8);
      if (big > BigInt(end - off)) return;
      size = Number(big);
      header = 16;
    } else if (size === 0) {
      size = end - off;
    }
    if (size < header || off + size > end) return;
    if (type === 'tkhd') {
      const t = trackHeader(b, off + header, off + size);
      if (t) out.push(t);
    } else if (CONTAINERS.has(type)) {
      walk(b, off + header, off + size, depth + 1, out);
    }
    off += size;
  }
}

function trackHeader(
  b: Buffer,
  start: number,
  end: number,
): { width: number; height: number; rotated: boolean } | null {
  const version = b[start];
  // version 0: 4 (version+flags) + 4+4+4+4+4 (times, id, reserved,
  // duration) + 8 reserved + 2+2+2+2 (layer, group, volume, reserved) +
  // 36 matrix + 4 width + 4 height; version 1 has 64-bit times (+12).
  const matrixAt = start + (version === 1 ? 52 : 40);
  const sizeAt = matrixAt + 36;
  if (sizeAt + 8 > end) return null;
  const a = b.readInt32BE(matrixAt);
  const bb = b.readInt32BE(matrixAt + 4);
  const width = Math.round(b.readUInt32BE(sizeAt) / 65536);
  const height = Math.round(b.readUInt32BE(sizeAt + 4) / 65536);
  // A 90° / 270° rotation: a = 0 and b = ±1 (16.16 fixed point).
  const rotated = a === 0 && Math.abs(bb) === 0x10000;
  return { width, height, rotated };
}

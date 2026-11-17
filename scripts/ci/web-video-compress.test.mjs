// The browser video compressor (apps/mobile/web/js/video_compress.js): its
// pure parts, run in Node on the real module (Mediabunny itself is loaded
// only when a video is sent, so importing the file loads nothing else).
// Media check 14.11 (owner rows 97/144), both measured in Chrome 156 first.
import assert from "node:assert/strict";
import test from "node:test";
import {
  moovFirst,
  targetBitrate,
} from "../../apps/mobile/web/js/video_compress.js";

const box = (type, size) => {
  const b = new Uint8Array(size);
  new DataView(b.buffer).setUint32(0, size);
  b.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  );
  return b;
};
const largeBox = (type, size) => {
  const b = new Uint8Array(size);
  const v = new DataView(b.buffer);
  v.setUint32(0, 1);
  b.set(
    [...type].map((c) => c.charCodeAt(0)),
    4,
  );
  v.setBigUint64(8, BigInt(size));
  return b;
};

test("the bitrate is always a positive integer (WebCodecs refuses a fraction)", () => {
  // Chrome 156, a 720p VP9 WebM: averageBitrate 1012345.678 → before
  // «options.bitrate, when provided, must be a positive integer».
  assert.equal(targetBitrate(2000, 1012345.678), 1012346);
  assert.ok(Number.isInteger(targetBitrate(4500, 3999999.5)));
  assert.equal(targetBitrate(2000, 9e6), 2000000);
  assert.equal(targetBitrate(2000, 0), 2000000);
  assert.equal(targetBitrate(2000, 0.2), 1);
});

test("fast start: moov before mdat is found from the box headers only", async () => {
  const fast = new Blob([box("ftyp", 24), box("moov", 40), box("mdat", 64)]);
  const tail = new Blob([
    box("ftyp", 24),
    box("free", 8),
    box("mdat", 64),
    box("moov", 40),
  ]);
  const big = new Blob([
    box("ftyp", 24),
    largeBox("mdat", 96),
    box("moov", 40),
  ]);
  assert.equal(await moovFirst(fast), true);
  assert.equal(await moovFirst(tail), false);
  assert.equal(await moovFirst(big), false);
  assert.equal(await moovFirst(new Blob([new Uint8Array(4)])), false);
  const broken = box("junk", 8);
  new DataView(broken.buffer).setUint32(0, 3); // size below a header
  assert.equal(await moovFirst(new Blob([box("ftyp", 24), broken])), false);
});

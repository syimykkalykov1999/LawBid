import { videoDimensions } from './video-dimensions';

/** Owner 2026-10-18: a chat video's shown size from its `tkhd` box. */
function box(type: string, body: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length, 0);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

function tkhd(width: number, height: number, rotated: boolean): Buffer {
  const b = Buffer.alloc(84);
  // version 0: matrix at 40, size at 76.
  b.writeInt32BE(rotated ? 0 : 0x10000, 40);
  b.writeInt32BE(rotated ? 0x10000 : 0, 44);
  b.writeUInt32BE(width * 65536, 76);
  b.writeUInt32BE(height * 65536, 80);
  return box('tkhd', b);
}

const file = (track: Buffer) =>
  Buffer.concat([
    box('ftyp', Buffer.from('isom\0\0\x02\0isomavc1', 'latin1')),
    box('moov', box('trak', track)),
  ]);

describe('videoDimensions', () => {
  it('reads the track size', () => {
    expect(videoDimensions(file(tkhd(1280, 720, false)))).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it('swaps a 90° rotated phone video (portrait)', () => {
    expect(videoDimensions(file(tkhd(1920, 1080, true)))).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('null without a track header', () => {
    expect(videoDimensions(box('ftyp', Buffer.from('isom')))).toBeNull();
    expect(videoDimensions(Buffer.from('garbage'))).toBeNull();
  });
});

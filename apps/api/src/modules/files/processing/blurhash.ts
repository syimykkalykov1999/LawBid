import { encode } from 'blurhash';
import sharp from 'sharp';

/**
 * BlurHash (4x3 components) of an image: the app paints it as a placeholder
 * until the real picture arrives (Instagram/Telegram style). Decoded from a
 * ≤32 px copy, so it costs a few ms. Never throws: null when the bytes are
 * not an image sharp can read.
 */
export async function computeBlurhash(data: Buffer): Promise<string | null> {
  try {
    const { data: px, info } = await sharp(data, { failOn: 'none' })
      .rotate()
      .resize(32, 32, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return encode(new Uint8ClampedArray(px), info.width, info.height, 4, 3);
  } catch {
    return null;
  }
}

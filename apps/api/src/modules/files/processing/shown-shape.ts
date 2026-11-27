import sharp from 'sharp';
import { FILE_MIME } from '../files.policy';
import { videoDimensions } from './video-dimensions';

/** The largest side a stored width / height may have (sane bound). */
export const SHOWN_SHAPE_MAX_SIDE = 65_535;

/**
 * Owner 27.11 («скачки везде»; WhatsApp / Telegram carry a photo's width
 * and height with the message): the shown size of an uploaded photo or
 * video, read at `confirm` from the bytes confirm already holds (the whole
 * file or its start), so a chat message has its shape before the antivirus
 * check ends and the receiver's bubble no longer jumps from a 4:3 stand-in
 * to the photo. Header only (sharp `metadata`, MP4 `tkhd`); EXIF
 * orientation 5–8 swaps the sides as the stored photo will. Null when the
 * start does not say (HEIC, a `moov` past the start, a broken file): the
 * check writes the size when it ends, as before. Read from the bytes, not
 * taken from the phone, so there is nothing to trust beyond sane bounds.
 */
export async function shownShape(
  data: Buffer,
  mime: string,
): Promise<{ width: number; height: number } | null> {
  try {
    if (mime === FILE_MIME.mp4 || mime === FILE_MIME.mov) {
      return sane(videoDimensions(data));
    }
    if (!mime.startsWith('image/') || mime === FILE_MIME.heic) return null;
    const meta = await sharp(data, { failOn: 'none' }).metadata();
    if (!meta.width || !meta.height) return null;
    const swap = (meta.orientation ?? 1) >= 5;
    return sane(
      swap
        ? { width: meta.height, height: meta.width }
        : { width: meta.width, height: meta.height },
    );
  } catch {
    return null;
  }
}

function sane(
  s: { width: number; height: number } | null,
): { width: number; height: number } | null {
  if (!s) return null;
  const ok = (n: number) =>
    Number.isInteger(n) && n > 0 && n <= SHOWN_SHAPE_MAX_SIDE;
  return ok(s.width) && ok(s.height) ? s : null;
}

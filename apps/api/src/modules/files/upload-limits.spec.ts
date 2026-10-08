import { ConflictException } from '@nestjs/common';
import {
  PLACE_SPECS,
  UPLOAD_PLACES,
  assertUploadCount,
  sanitizeUploadLimits,
} from './upload-limits';

/** Owner 2026-10-07 (bug 17): admin upload limits stay safe. */
describe('upload limits', () => {
  it('defaults are what the app allowed before', () => {
    const d = sanitizeUploadLimits(undefined);
    expect(d.post).toMatchObject({ maxPhotos: 9, maxFiles: 9, fileMb: 10 });
    expect(d.case.maxFiles).toBe(9);
    expect(d.task.maxFiles).toBe(10);
    expect(d.review.maxPhotos).toBe(10);
    expect(d.avatar.fileMb).toBe(5);
    expect(d.chat.fileMb).toBe(25);
    expect(d.verification.maxFiles).toBe(3);
    expect(d.client_badge.maxFiles).toBe(5);
  });

  it('numbers are clamped to the hard ceilings', () => {
    const l = sanitizeUploadLimits({
      post: { maxPhotos: 500, fileMb: 9999, totalMb: -3 },
      avatar: { fileMb: 1000 },
    });
    expect(l.post.maxPhotos).toBe(PLACE_SPECS.post.ceiling.count);
    expect(l.post.fileMb).toBe(PLACE_SPECS.post.ceiling.fileMb);
    expect(l.post.totalMb).toBe(1);
    expect(l.avatar.fileMb).toBe(PLACE_SPECS.avatar.ceiling.fileMb);
  });

  it('programs, archives and scripts can never be turned on', () => {
    const bad = ['apk', 'exe', 'zip', 'rar', 'js', 'sh', 'docm', 'xlsm'];
    const l = sanitizeUploadLimits(
      Object.fromEntries(
        UPLOAD_PLACES.map((p) => [p, { formats: [...bad, 'pdf'] }]),
      ),
    );
    for (const p of UPLOAD_PLACES) {
      for (const f of bad) expect(l[p].formats).not.toContain(f);
    }
    // Documents never become a profile photo.
    expect(l.avatar.formats).toEqual([]);
    expect(l.post.formats).toEqual(['pdf']);
  });

  it('counts refuse with FILES_COUNT_LIMIT; older items may keep files', () => {
    const l = sanitizeUploadLimits({ post: { maxPhotos: 2 } });
    expect(() => assertUploadCount(l, 'post', 'photos', 2)).not.toThrow();
    expect(() => assertUploadCount(l, 'post', 'photos', 3)).toThrow(
      ConflictException,
    );
    expect(() => assertUploadCount(l, 'post', 'photos', 3, 4)).not.toThrow();
    expect(() => assertUploadCount(l, 'chat', 'files', 50)).not.toThrow();
  });
});

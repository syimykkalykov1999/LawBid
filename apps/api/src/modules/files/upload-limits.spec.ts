import { ConflictException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    // Owner 2026-10-19: 9 photos and 3 documents, counted separately.
    expect(d.case.maxPhotos).toBe(9);
    expect(d.case.maxFiles).toBe(3);
    expect(d.task.maxFiles).toBe(10);
    expect(d.review.maxPhotos).toBe(10);
    expect(d.avatar.fileMb).toBe(5);
    // Owner 2026-10-17: 50 MB for chat videos.
    expect(d.chat.fileMb).toBe(50);
    expect(d.chat.formats).toEqual(expect.arrayContaining(['mp4', 'mov']));
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

describe('case limits saved while counted together (owner 2026-10-19)', () => {
  it('read as the split defaults, formats and MB kept', () => {
    const l = sanitizeUploadLimits({
      case: { maxFiles: 9, fileMb: 20, formats: ['jpeg', 'pdf'] },
    });
    expect(l.case.maxPhotos).toBe(9);
    expect(l.case.maxFiles).toBe(3);
    expect(l.case.fileMb).toBe(20);
    expect(l.case.formats).toEqual(['jpeg', 'pdf']);
  });
});

/** Media batch A (R1, audit 13.11): clamd scanned up to 55 MB while an admin
 * could allow 100 MB a file; a bigger file was deleted after its upload. The
 * scanner's limit (Terraform) must cover every ceiling here. */
describe('the antivirus limit covers every upload ceiling', () => {
  const tf = readFileSync(
    join(__dirname, '../../../../../infra/modules/ecs/main.tf'),
    'utf8',
  );

  it('clamav_max_file_mb ≥ the largest MB per file an admin can set', () => {
    const m = /variable "clamav_max_file_mb" \{[^}]*?default\s*=\s*(\d+)/.exec(
      tf,
    );
    expect(m).not.toBeNull();
    const scannerMb = Number(m![1]);
    const ceiling = Math.max(
      ...UPLOAD_PLACES.map((p) => PLACE_SPECS[p].ceiling.fileMb),
    );
    expect(ceiling).toBeGreaterThan(0);
    expect(scannerMb).toBeGreaterThanOrEqual(ceiling);
  });

  it('clamd and the worker read that same variable', () => {
    for (const opt of ['StreamMaxLength', 'MaxFileSize']) {
      expect(tf).toContain(
        `{ name = "CLAMD_CONF_${opt}", value = "\${var.clamav_max_file_mb}M" }`,
      );
    }
    expect(tf).toContain(
      '{ name = "CLAMAV_MAX_MB", value = tostring(var.clamav_max_file_mb) }',
    );
  });
});

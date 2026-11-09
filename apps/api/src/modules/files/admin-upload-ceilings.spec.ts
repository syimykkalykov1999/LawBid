import {
  FILE_03_SETTINGS,
  OWNER_MEDIA_SETTINGS,
} from '../../common/app-settings/app-settings.defaults';
import { MB, PURPOSE_RULES } from './files.policy';
import { MIN_MULTIPART_BYTES } from './multipart';

/**
 * SPEED_MATRIX 2026-11-09 §3 №8 («админка: куски / пачки / докачка»):
 * every file an admin uploads (a sticker or gift, a document template, a
 * support attachment) is capped BELOW the server's own multipart threshold
 * (`MIN_MULTIPART_BYTES`, 16 MiB) — the same rule the app applies on the
 * phone (`storage_uploader.dart`: under 16 MiB one request, parts only
 * above). Cutting such a file into parts would cost more requests, not
 * less time. This guard turns red the day a ceiling is raised past the
 * threshold: then the admin's uploaders need the part plan
 * (`POST /files/:id/multipart`) the app already uses.
 */
describe('admin upload ceilings vs the multipart threshold', () => {
  const ceilingsMb: Record<string, number> = {
    sticker: OWNER_MEDIA_SETTINGS['files.sticker_max_size_mb'],
    document_template:
      OWNER_MEDIA_SETTINGS['files.document_template_max_size_mb'],
    support_attachment: FILE_03_SETTINGS['files.max_size_mb'],
  };

  it.each(Object.entries(ceilingsMb))(
    '%s: default ceiling %d MB stays under one-request size',
    (_purpose, mb) => {
      expect(mb * MB).toBeLessThan(MIN_MULTIPART_BYTES);
    },
  );

  it('the admin purposes are sized by exactly these settings', () => {
    expect(PURPOSE_RULES.sticker.sizeSetting).toBe('files.sticker_max_size_mb');
    expect(PURPOSE_RULES.document_template.sizeSetting).toBe(
      'files.document_template_max_size_mb',
    );
    // support_attachment has no setting of its own: the general cap applies.
    expect(
      PURPOSE_RULES.support_attachment.sizeSetting ?? 'files.max_size_mb',
    ).toBe('files.max_size_mb');
  });
});

import { PURPOSE_RULES } from './files.policy';

// Owner 2026-10-24: only these purposes are public and may be stored in
// Cloudflare R2. Moving a private purpose to the `media` bucket would put
// attorney-client files on R2, so this list changes only on purpose.
const PUBLIC_PURPOSES = [
  'avatar',
  'post_image',
  'post_video',
  'review_photo',
  'sticker',
];

describe('public / private split of file purposes', () => {
  it('exactly the public purposes use the media bucket (the only one R2 can serve)', () => {
    const media = Object.entries(PURPOSE_RULES)
      .filter(([, rule]) => rule.bucket === 'media')
      .map(([purpose]) => purpose)
      .sort();
    expect(media).toEqual([...PUBLIC_PURPOSES].sort());
  });

  it.each([
    'chat_attachment',
    'chat_voice',
    'case_photo',
    'case_attachment',
    'support_attachment',
    'task_attachment',
    'post_attachment',
    'document_template',
    'verification_document',
    'verification_selfie',
    'data_export',
  ] as const)('%s is private (documents bucket)', (purpose) => {
    expect(PURPOSE_RULES[purpose].bucket).toBe('documents');
  });
});

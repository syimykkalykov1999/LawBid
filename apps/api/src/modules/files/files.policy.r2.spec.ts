import { mayUsePublicStore, PURPOSE_RULES } from './files.policy';

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

  // Owner 2026-11-05: images go to R2, video and reels go to Bunny. A video
  // purpose must never route to R2, even though its bucket kind is `media`.
  it('post_video never uses the R2 public store; public images still may', () => {
    expect(PURPOSE_RULES.post_video.bucket).toBe('media');
    expect(mayUsePublicStore('post_video')).toBe(false);
    for (const purpose of [
      'avatar',
      'post_image',
      'review_photo',
      'sticker',
    ] as const) {
      expect(mayUsePublicStore(purpose)).toBe(true);
    }
  });

  it('private purposes never use the public store', () => {
    for (const [purpose, rule] of Object.entries(PURPOSE_RULES)) {
      if (rule.bucket === 'documents') {
        expect(mayUsePublicStore(purpose as keyof typeof PURPOSE_RULES)).toBe(
          false,
        );
      }
    }
  });
});

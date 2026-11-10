import { PURPOSE_RULES } from './files.policy';

/**
 * SPEED_MATRIX 2026-11-09 §3 №8: the admin purposes (a sticker or gift, a
 * document template, a support attachment) are sized by these settings.
 * 2026-11-09: #889 lowered the server's multipart threshold to one 5 MiB
 * part, so the old guard «every admin ceiling stays under the threshold»
 * no longer holds; it never was a limit — the server accepts one request
 * up to the purpose's cap, parts only make big files faster (templates
 * use them in the admin since #882).
 */
describe('admin upload ceilings', () => {
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

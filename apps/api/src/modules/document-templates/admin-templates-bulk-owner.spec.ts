import { BadRequestException } from '@nestjs/common';
import { AdminDocumentTemplatesController } from './admin-document-templates.controller';
import { TEMPLATES_BULK_MAX } from './document-templates.dto';

/** Owner 2026-11-12: the owner publishes / deletes any number at once. */
describe('admin document templates bulk without a cap for the owner', () => {
  function build() {
    const record = jest.fn().mockResolvedValue(undefined);
    const setPublished = jest.fn().mockResolvedValue(undefined);
    const ctl = Object.create(
      AdminDocumentTemplatesController.prototype,
    ) as AdminDocumentTemplatesController;
    Object.assign(ctl, { audit: { record }, templates: { setPublished } });
    return { ctl, record, setPublished };
  }
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `t${i}`);

  it('the owner publishes 600: two chunks, an audit row each', async () => {
    const { ctl, record, setPublished } = build();
    const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
    const out = await ctl.bulkAdminDocumentTemplates(owner, {
      action: 'publish',
      ids: ids(600),
    });
    expect(out.done).toHaveLength(600);
    expect(setPublished).toHaveBeenCalledTimes(600);
    expect(record).toHaveBeenCalledTimes(2);
  });

  it('staff keep 100', async () => {
    const { ctl, setPublished } = build();
    const staff = { id: 's', ip: null, adminRole: 'moderator' } as never;
    await expect(
      ctl.bulkAdminDocumentTemplates(staff, {
        action: 'publish',
        ids: ids(TEMPLATES_BULK_MAX + 1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(setPublished).not.toHaveBeenCalled();
  });
});

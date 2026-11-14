import { AdminDocumentTemplatesController } from './admin-document-templates.controller';
import { DocumentTemplatesService } from './document-templates.service';

/** Owner 14.11 (row 179 follow-up B6): «Выбрать всё по фильтру» on the
 * templates list sends the FILTER; the server resolves the ids with the
 * list's where. */
describe('admin document templates bulk by filter', () => {
  const owner = { id: 'o', ip: null, adminRole: 'super_admin' } as never;
  const staff = { id: 's', ip: null, adminRole: 'moderator' } as never;

  function build() {
    const findMany = jest.fn(
      (a: { take?: number; select?: Record<string, unknown> }) =>
        Promise.resolve(
          a.select
            ? Array.from({ length: Math.min(3, a.take ?? 3) }, (_, i) => ({
                id: `t${i}`,
              }))
            : [],
        ),
    );
    const templates = Object.create(
      DocumentTemplatesService.prototype,
    ) as DocumentTemplatesService;
    Object.assign(templates, { prisma: { documentTemplate: { findMany } } });
    const setPublished = jest
      .spyOn(templates, 'setPublished')
      .mockResolvedValue(undefined as never);
    const record = jest.fn().mockResolvedValue(undefined);
    const settings = { number: jest.fn().mockResolvedValue(2) };
    const ctl = Object.create(
      AdminDocumentTemplatesController.prototype,
    ) as AdminDocumentTemplatesController;
    Object.assign(ctl, { templates, audit: { record }, settings });
    return { ctl, templates, findMany, setPublished, record };
  }

  it('the ids come from the list where', async () => {
    const { templates, findMany } = build();
    const q = { q: 'lease nda', published: false, state: 'NV' };
    await templates.adminList(q);
    await templates.adminIdsByFilter(q, null);
    const calls = findMany.mock.calls as [
      { where: unknown; select?: unknown },
    ][];
    const list = calls.find(([a]) => !a.select)![0].where;
    const ids = calls.find(([a]) => a.select)![0].where;
    expect(ids).toEqual(list);
  });

  it('staff: capped by the setting; the filter audited', async () => {
    const { ctl, setPublished, record } = build();
    const out = await ctl.bulkAdminDocumentTemplates(staff, {
      action: 'publish',
      filter: { published: false },
    } as never);
    expect(out.done).toEqual(['t0', 't1']);
    expect(setPublished).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[0][0]).toMatchObject({
      action: 'admin.document_template.bulk_filter',
      after: { action: 'publish', matched: 2, capped: true },
    });
  });

  it('preview (owner: no cap)', async () => {
    const { ctl } = build();
    await expect(
      ctl.previewAdminDocumentTemplatesBulk(owner, { filter: {} }),
    ).resolves.toEqual({ matched: 3, capped: false, cap: null });
  });
});

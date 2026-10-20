import type { PrismaService } from '../../../prisma/prisma.service';
import { NotificationTemplateService } from './notification-template.service';

/** Owner 2026-10-07: a verification push says what actually happened. */
describe('NotificationTemplateService.renderFor', () => {
  const rows: Record<string, string> = {
    'ru:notif.verification.rejected': 'Заявка отклонена (из админки).',
  };
  const prisma = {
    i18nTranslation: {
      findFirst: jest.fn(
        ({ where }: { where: { lang: string; i18n_key: { key: string } } }) => {
          const v = rows[`${where.lang}:${where.i18n_key.key}`];
          return Promise.resolve(v ? { value: v } : null);
        },
      ),
    },
  } as unknown as PrismaService;
  const service = new NotificationTemplateService(prisma);

  it('uses the admin text of the kind', async () => {
    const t = await service.renderFor(
      'verification_update',
      { kind: 'rejected' },
      'ru',
    );
    expect(t).toEqual({
      title: 'Верификация',
      body: 'Заявка отклонена (из админки).',
    });
  });

  it('a sworn statement is not called a confirmed license', async () => {
    const t = await service.renderFor(
      'verification_update',
      { kind: 'self_attested' },
      'ru',
    );
    expect(t.body).toContain('принята под присягой');
    expect(t.body).not.toContain('изменился');
  });

  it('no kind, or another type: the generic text', async () => {
    const t = await service.renderFor('verification_update', {}, 'en');
    expect(t.body).toBe('Your verification status has changed.');
    const odd = await service.renderFor(
      'verification_update',
      { kind: '../x' },
      'en',
    );
    expect(odd.body).toBe('Your verification status has changed.');
  });

  // Audit 2026-10-19: «Новое в кейсе» says what the other side added.
  it('a case workspace push names what was added', async () => {
    const t = await service.renderFor(
      'case_workspace_activity',
      { kind: 'task_done', caseId: 'k' },
      'ru',
    );
    expect(t).toEqual({
      title: 'Новое в кейсе',
      body: 'Задача в кейсе выполнена.',
    });
    const other = await service.renderFor(
      'case_workspace_activity',
      { kind: 'nope' },
      'en',
    );
    expect(other.title).toBe('New in your case');
    expect(other.body).toContain('added something');
  });
});

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

  it('owner 2026-10-24: the grace-period push names the state, date and days', async () => {
    const t = await service.renderFor(
      'verification_update',
      {
        kind: 'license_renewal_due',
        stateCode: 'NY',
        expiresAt: '2026-10-20',
        graceDays: 14,
      },
      'en',
    );
    expect(t.body).toContain('NY license expired on 2026-10-20');
    expect(t.body).toContain('within 14 days');
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

  // Owner 2026-10-20: the planner push says what and when, never the title.
  describe('task_reminder', () => {
    const payload = {
      kind: 'meeting',
      taskId: 't',
      dueAt: '2026-10-20T18:30:00.000Z',
      remindAt: '2026-10-20T18:15:00.000Z',
    };

    it("names the kind and the time on the person's own clock", async () => {
      const ny = await service.renderFor(
        'task_reminder',
        payload,
        'en',
        'America/New_York',
      );
      expect(ny.title).toBe('Task reminder');
      expect(ny.body).toBe('Meeting · 2:30 PM');
      const la = await service.renderFor(
        'task_reminder',
        payload,
        'ru',
        'Europe/Moscow',
      );
      expect(la.title).toBe('Напоминание о задаче');
      expect(la.body).toBe('Встреча · 21:30');
    });

    it('a missed reminder says so and carries the date', async () => {
      const t = await service.renderFor(
        'task_reminder',
        { ...payload, missed: true },
        'ru',
        'Europe/Moscow',
      );
      expect(t.title).toBe('Пропущено напоминание о задаче');
      expect(t.body).toMatch(/^Встреча · .*20.*21:30$/);
    });

    it('never carries the task title', async () => {
      const t = await service.renderFor(
        'task_reminder',
        { ...payload, title: 'Secret client call' },
        'en',
      );
      expect(JSON.stringify(t)).not.toContain('Secret');
    });

    it('an unknown zone or language falls back instead of failing', async () => {
      const t = await service.renderFor(
        'task_reminder',
        payload,
        'zz-bogus-!!',
        'Mars/Base',
      );
      expect(t.body).toMatch(/Meeting · /);
    });
  });
});

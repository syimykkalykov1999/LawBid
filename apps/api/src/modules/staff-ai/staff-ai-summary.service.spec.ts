import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  StaffAiSummaryService,
  type SummaryViewer,
} from './staff-ai-summary.service';
import {
  AI_ON,
  clientKit,
  messageOf,
  settingsOf,
} from './staff-ai.test-support';

const SG = {
  id: 's1',
  admin_id: 'a0000000-0000-4000-8000-000000000001',
  kind: 'replace',
  evidence: { best: ['x'], worst: ['y'] },
};
const OWNER: SummaryViewer = { adminRole: 'super_admin' };

function setup(
  stored: Record<string, unknown>,
  suggestions = [SG],
  template?: { describe: jest.Mock },
) {
  const kit = clientKit({ ...AI_ON, ...stored }, () =>
    messageOf({ text: 'Рейтинг упал, 3 из 10 перепроверок не совпали.' }),
  );
  const prisma = {
    staffSuggestion: {
      findMany: jest.fn(() => Promise.resolve(suggestions)),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(suggestions.find((s) => s.id === where.id) ?? null),
      ),
    },
    staffRatingSnapshot: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            rating: 58,
            status: 'red',
            n_decisions: 60,
            accuracy: 50,
            clean: 60,
            users_verdict: 70,
            speed: 80,
            flags: ['low_rating'],
          },
        ]),
      ),
      findFirst: jest.fn(() => Promise.resolve({ workspace: 'mass' })),
    },
    staffQualitySignal: {
      groupBy: jest.fn(() =>
        Promise.resolve([{ kind: 'complaint', _count: { _all: 2 } }]),
      ),
      findMany: jest.fn(() => Promise.resolve([{ value: -80 }, { value: 70 }])),
    },
  };
  const svc = new StaffAiSummaryService(
    prisma as unknown as PrismaService,
    kit.redis as never,
    settingsOf({ ...AI_ON, ...stored }),
    kit.client,
    template,
  );
  return { svc, kit, prisma };
}

describe('StaffAiSummaryService', () => {
  it('nightly: writes the missing text once per suggestion, from de-identified evidence', async () => {
    const t = setup({});
    expect(await t.svc.refreshNightly()).toMatchObject({
      candidates: 1,
      written: 1,
      failed: 0,
    });
    expect(t.kit.calls).toHaveLength(1);
    const prompt = t.kit.calls[0].body.messages[0].content as string;
    expect(prompt).toContain('suggested step');
    expect(prompt).toContain('заменить');
    expect(prompt).toContain('2 judged'.slice(0, 1)); // ai re-check line present
    expect(prompt).not.toContain(SG.admin_id);
    // second night: cached, no second call
    expect(await t.svc.refreshNightly()).toMatchObject({
      candidates: 0,
      written: 0,
    });
    expect(t.kit.calls).toHaveLength(1);
  });

  it('stops at the ceiling instead of failing every card', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ ...SG, id: `s${i}` }));
    const t = setup({ 'staff.ai.monthly_cents': 0 }, many);
    expect(await t.svc.refreshNightly()).toMatchObject({
      written: 0,
      stoppedEarly: 1,
    });
    expect(t.kit.calls).toHaveLength(0);
  });

  it('get: AI text when cached, the rule template (T5/T10) otherwise, none when neither', async () => {
    const template = { describe: jest.fn(() => 'Шаблон: рейтинг ниже нормы.') };
    const t = setup({}, [SG], template);
    await expect(t.svc.get(OWNER, 's1')).resolves.toMatchObject({
      source: 'template',
      text: 'Шаблон: рейтинг ниже нормы.',
    });
    await t.svc.refreshNightly();
    await expect(t.svc.get(OWNER, 's1')).resolves.toMatchObject({
      source: 'ai',
      available: true,
    });
    const bare = setup({});
    await expect(bare.svc.get(OWNER, 's1')).resolves.toEqual({
      available: false,
      source: 'none',
      text: null,
    });
  });

  it('get: off → 404; unknown id → 404; a head only sees their own workspace', async () => {
    await expect(
      setup({ 'staff.ai_summary_enabled': false }).svc.get(OWNER, 's1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(setup({}).svc.get(OWNER, 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    const t = setup({});
    await expect(
      t.svc.get(
        { adminRole: 'moderator', workspace: 'mass', workspaceHead: true },
        's1',
      ),
    ).resolves.toBeDefined();
    await expect(
      t.svc.get(
        { adminRole: 'moderator', workspace: 'finance', workspaceHead: true },
        's1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      t.svc.get({ adminRole: 'moderator', workspace: 'mass' }, 's1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

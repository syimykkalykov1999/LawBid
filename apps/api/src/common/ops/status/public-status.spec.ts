import {
  buildPublicStatus,
  type IncidentInput,
} from './public-status';
import { PublicStatusService } from './public-status.service';
import type { ProbeResult } from './status-probes.service';

const NOW = new Date('2026-10-25T12:00:00Z');
const probe = (key: string, status: ProbeResult['status']): ProbeResult => ({
  key,
  status,
  detail: { secret: 'internal-host:5432' },
});
const incident = (p: Partial<IncidentInput>): IncidentInput => ({
  id: 'i1',
  component: 'redis',
  severity: 'red',
  title: 'redis',
  detail: {},
  openedAt: new Date('2026-10-25T11:00:00Z'),
  closedAt: null,
  ...p,
});
const state = (s: ReturnType<typeof buildPublicStatus>, k: string) =>
  s.components.find((c) => c.key === k)?.state;

describe('buildPublicStatus', () => {
  it('is all operational when probes are green or grey', () => {
    const s = buildPublicStatus(
      [probe('http', 'green'), probe('push', 'grey')],
      [],
      NOW,
    );
    expect(s.overall).toBe('operational');
    expect(s.components.map((c) => c.key)).toEqual([
      'app',
      'chats',
      'calls',
      'payments',
      'notifications',
    ]);
  });

  it('one red check is only degraded, an open incident makes it an outage', () => {
    const red = [probe('stripe_webhooks', 'red')];
    expect(state(buildPublicStatus(red, [], NOW), 'payments')).toBe('degraded');
    const withInc = buildPublicStatus(
      red,
      [incident({ component: 'stripe_webhooks' })],
      NOW,
    );
    expect(state(withInc, 'payments')).toBe('outage');
    expect(withInc.overall).toBe('outage');
    expect(withInc.incidents[0].auto).toBe(true);
  });

  it('yellow is degraded; the worst probe of a component wins', () => {
    const s = buildPublicStatus(
      [probe('cloudflare_turn', 'green'), probe('cloudflare_sfu', 'yellow')],
      [],
      NOW,
    );
    expect(state(s, 'calls')).toBe('degraded');
  });

  it('an open admin incident sets the component; resolved does not', () => {
    const manual = incident({
      id: 'm1',
      component: 'chats',
      severity: 'outage',
      detail: {
        manual: true,
        title: { ru: 'Чаты не работают', en: 'Chats down' },
        message: { ru: 'Чиним', en: '' },
      },
    });
    const open = buildPublicStatus([], [manual], NOW);
    expect(state(open, 'chats')).toBe('outage');
    expect(open.incidents[0].title.en).toBe('Chats down');
    expect(open.incidents[0].message.en).toBe('Чиним');
    expect(open.incidents[0].auto).toBe(false);
    const done = buildPublicStatus(
      [],
      [{ ...manual, closedAt: new Date('2026-10-25T11:30:00Z') }],
      NOW,
    );
    expect(state(done, 'chats')).toBe('operational');
    expect(done.incidents[0].resolvedAt).not.toBeNull();
  });

  it('maintenance is listed but does not turn the component red', () => {
    const s = buildPublicStatus(
      [],
      [
        incident({
          component: 'app',
          severity: 'maint',
          detail: { manual: true, title: { ru: 'Работы' } },
        }),
      ],
      NOW,
    );
    expect(state(s, 'app')).toBe('operational');
    expect(s.incidents[0].kind).toBe('maintenance');
  });

  it('never leaks probe details', () => {
    const s = buildPublicStatus([probe('database', 'yellow')], [], NOW);
    expect(JSON.stringify(s)).not.toContain('internal-host');
  });
});

describe('PublicStatusService', () => {
  function make(bucket?: string) {
    const rows: Record<string, unknown>[] = [];
    const prisma = {
      systemIncident: {
        findMany: jest.fn().mockResolvedValue(rows),
        create: jest.fn(),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const probes = { watched: jest.fn().mockResolvedValue([]) };
    const config = { get: (k: string) => (k === 'STATUS_PAGE_BUCKET' ? bucket : undefined) };
    const logger = { setContext: jest.fn(), warn: jest.fn() };
    const svc = new PublicStatusService(
      prisma as never,
      probes as never,
      config as never,
      logger as never,
    );
    return { svc, prisma, probes };
  }

  it('publishes nothing while no bucket is configured', async () => {
    const { svc, probes } = make(undefined);
    expect(svc.enabled).toBe(false);
    expect(await svc.publish()).toBe(false);
    expect(probes.watched).not.toHaveBeenCalled();
  });

  it('refuses a second open incident on a component (409)', async () => {
    const { svc, prisma } = make(undefined);
    prisma.systemIncident.create.mockRejectedValue(new Error('unique'));
    await expect(
      svc.post({ component: 'chats', kind: 'outage', titleRu: 'Сбой чатов' }),
    ).rejects.toThrow(/already has an open incident/);
  });

  it('stores the admin words and the short severity for maintenance', async () => {
    const { svc, prisma } = make(undefined);
    prisma.systemIncident.create.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'x', closed_at: null, opened_at: new Date(), ...data }),
    );
    const r = await svc.post({
      component: 'app',
      kind: 'maintenance',
      titleRu: 'Работы',
      messageRu: 'С 3 до 4',
    });
    const data = prisma.systemIncident.create.mock.calls[0][0].data;
    expect(data.severity).toBe('maint');
    expect(data.detail.manual).toBe(true);
    expect(data.detail.title.en).toBe('Работы');
    expect(r.id).toBe('x');
  });

  it('resolves only incidents an admin posted', async () => {
    const { svc, prisma } = make(undefined);
    prisma.systemIncident.findUnique.mockResolvedValue({
      id: 'a',
      detail: {},
      closed_at: null,
    });
    await expect(svc.resolve('a')).rejects.toThrow();
    prisma.systemIncident.findUnique.mockResolvedValue({
      id: 'b',
      detail: { manual: true },
      closed_at: null,
    });
    await svc.resolve('b');
    expect(prisma.systemIncident.updateMany).toHaveBeenCalledTimes(1);
  });
});

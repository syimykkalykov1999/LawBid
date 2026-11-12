import { NotFoundException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { SecretsService } from '../../common/secrets/secrets.service';
import type { AiAssistantService } from './ai-assistant.service';
import { SentryWebhookController } from './sentry-webhook.controller';

const SECRET = 'a1'.repeat(32);

function setup(secrets: string[] = [SECRET]) {
  const trigger = jest.fn().mockResolvedValue('dispatched');
  const ctrl = new SentryWebhookController(
    {
      getAll: jest
        .fn()
        .mockResolvedValue(
          secrets.map((s) => ({ fields: { clientSecret: s } })),
        ),
    } as unknown as SecretsService,
    { trigger } as unknown as AiAssistantService,
  );
  return { ctrl, trigger };
}

const body = {
  action: 'created',
  installation: { uuid: 'i' },
  data: {
    issue: {
      id: '777',
      level: 'error',
      title: 'TypeError: x is undefined',
      culprit: 'CasesService.list',
      metadata: { value: 'anna@example.com' },
    },
  },
};
const raw = Buffer.from(JSON.stringify(body));
const sign = (b: Buffer, k = SECRET) =>
  createHmac('sha256', k).update(b).digest('hex');

describe('SentryWebhookController (12.11.2026)', () => {
  it('a signed new error starts the assistant with title and culprit only', async () => {
    const { ctrl, trigger } = setup();
    await expect(
      ctrl.sentryWebhook({ rawBody: raw }, sign(raw), 'issue', body),
    ).resolves.toEqual({ received: true });
    expect(trigger).toHaveBeenCalledWith(
      'sentry',
      '777',
      'error: TypeError: x is undefined @ CasesService.list',
    );
  });

  it('accepts a rotated secret (any saved key set)', async () => {
    const { ctrl, trigger } = setup(['b2'.repeat(32), SECRET]);
    await ctrl.sentryWebhook({ rawBody: raw }, sign(raw), 'issue', body);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('a bad or missing signature, or no saved secret, is a plain 404', async () => {
    const { ctrl, trigger } = setup();
    await expect(
      ctrl.sentryWebhook({ rawBody: raw }, sign(raw, 'other'), 'issue', body),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      ctrl.sentryWebhook({ rawBody: raw }, undefined, 'issue', body),
    ).rejects.toBeInstanceOf(NotFoundException);
    const none = setup([]);
    await expect(
      none.ctrl.sentryWebhook({ rawBody: raw }, sign(raw), 'issue', body),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(trigger).not.toHaveBeenCalled();
    expect(none.trigger).not.toHaveBeenCalled();
  });

  it('signed but not a new error/fatal issue: 200, no run', async () => {
    const { ctrl, trigger } = setup();
    const resolved = { ...body, action: 'resolved' };
    const r2 = Buffer.from(JSON.stringify(resolved));
    await ctrl.sentryWebhook({ rawBody: r2 }, sign(r2), 'issue', resolved);
    const warn = {
      ...body,
      data: { issue: { ...body.data.issue, level: 'warning' } },
    };
    const r3 = Buffer.from(JSON.stringify(warn));
    await ctrl.sentryWebhook({ rawBody: r3 }, sign(r3), 'issue', warn);
    await ctrl.sentryWebhook({ rawBody: raw }, sign(raw), 'error', body);
    expect(trigger).not.toHaveBeenCalled();
  });
});

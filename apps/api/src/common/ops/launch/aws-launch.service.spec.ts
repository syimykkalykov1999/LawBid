import {
  AwsBudgetsAdminService,
  PagerDutySnsService,
  maskPagerDutyUrl,
  splitRecordType,
} from './aws-launch.service';

const TOPIC = 'arn:aws:sns:us-east-1:111122223333:lawbid-prod-critical';
const URL_A =
  'https://events.pagerduty.com/integration/AAAA1111BBBB2222CCCC3333DDDD4444/enqueue';
const URL_B =
  'https://events.pagerduty.com/integration/ZZZZ9999YYYY8888XXXX7777WWWW6666/enqueue';

function pager(
  url: string | undefined,
  subs: { Protocol: string; Endpoint: string; SubscriptionArn: string }[],
  env: Record<string, string> = { OPS_CRITICAL_TOPIC_ARN: TOPIC },
) {
  const store = new Map<string, unknown>();
  const prisma = {
    appConfig: {
      findUnique: jest.fn(({ where }) =>
        Promise.resolve(
          store.has(where.key)
            ? { key: where.key, value: store.get(where.key) }
            : null,
        ),
      ),
      upsert: jest.fn(({ where, create }) => {
        store.set(where.key, create.value);
        return Promise.resolve({});
      }),
      deleteMany: jest.fn(({ where }) => {
        store.delete(where.key);
        return Promise.resolve({ count: 1 });
      }),
    },
  };
  const svc = new PagerDutySnsService(
    { get: (k: string) => env[k] } as never,
    { field: jest.fn().mockResolvedValue(url) } as never,
    prisma as never,
  );
  const send = jest.fn(
    (cmd: { constructor: { name: string }; input: unknown }) => {
      if (cmd.constructor.name === 'ListSubscriptionsByTopicCommand') {
        return Promise.resolve({ Subscriptions: subs });
      }
      return Promise.resolve({});
    },
  );
  (svc as unknown as { sns: unknown }).sns = { send };
  const calls = (name: string) =>
    send.mock.calls
      .filter((c) => c[0].constructor.name === name)
      .map((c) => c[0].input);
  return { svc, calls, store };
}

describe('PagerDutySnsService (admin «Запуск»)', () => {
  it('masks the link: never the whole key', () => {
    expect(maskPagerDutyUrl(URL_A)).toBe(
      'https://events.pagerduty.com/integration/AAAA…4444/enqueue',
    );
    expect(maskPagerDutyUrl('nonsense')).toBe('…');
  });

  it('is unavailable off AWS and does no call', async () => {
    const { svc, calls } = pager(URL_A, [], {});
    const s = await svc.status(true);
    expect(s).toMatchObject({
      available: false,
      configured: true,
      state: 'none',
    });
    expect(calls('ListSubscriptionsByTopicCommand')).toHaveLength(0);
  });

  it('reports pending and confirmed', async () => {
    const pending = pager(URL_A, [
      {
        Protocol: 'https',
        Endpoint: URL_A,
        SubscriptionArn: 'PendingConfirmation',
      },
    ]);
    expect((await pending.svc.status(true)).state).toBe('pending');
    const ok = pager(URL_A, [
      { Protocol: 'https', Endpoint: URL_A, SubscriptionArn: `${TOPIC}:abc` },
    ]);
    const s = await ok.svc.status(true);
    expect(s.state).toBe('confirmed');
    expect(JSON.stringify(s)).not.toContain('AAAA1111BBBB');
  });

  it('subscribes the saved link to the critical topic and remembers it', async () => {
    const { svc, calls, store } = pager(URL_A, []);
    await svc.sync();
    expect(calls('SubscribeCommand')).toEqual([
      expect.objectContaining({
        TopicArn: TOPIC,
        Protocol: 'https',
        Endpoint: URL_A,
      }),
    ]);
    expect(store.get('ops.pagerduty_sub')).toEqual({
      hash: expect.any(String),
    });
  });

  it('does not subscribe twice', async () => {
    const { svc, calls } = pager(URL_A, [
      { Protocol: 'https', Endpoint: URL_A, SubscriptionArn: `${TOPIC}:abc` },
    ]);
    await svc.sync();
    expect(calls('SubscribeCommand')).toHaveLength(0);
  });

  it('on a changed link unsubscribes the old one and subscribes the new one', async () => {
    const first = pager(URL_A, []);
    await first.svc.sync(); // records URL_A
    const hash = first.store.get('ops.pagerduty_sub');
    const { svc, calls, store } = pager(URL_B, [
      { Protocol: 'https', Endpoint: URL_A, SubscriptionArn: `${TOPIC}:old` },
    ]);
    store.set('ops.pagerduty_sub', hash);
    await svc.sync();
    expect(calls('UnsubscribeCommand')).toEqual([
      { SubscriptionArn: `${TOPIC}:old` },
    ]);
    expect(calls('SubscribeCommand')).toEqual([
      expect.objectContaining({ Endpoint: URL_B }),
    ]);
  });

  it('on removal unsubscribes what it subscribed and forgets it; never touches foreign subscriptions', async () => {
    const first = pager(URL_A, []);
    await first.svc.sync();
    const { svc, calls, store } = pager(undefined, [
      { Protocol: 'https', Endpoint: URL_A, SubscriptionArn: `${TOPIC}:mine` },
      {
        Protocol: 'https',
        Endpoint: URL_B,
        SubscriptionArn: `${TOPIC}:foreign`,
      },
    ]);
    store.set('ops.pagerduty_sub', first.store.get('ops.pagerduty_sub'));
    await svc.sync();
    expect(calls('UnsubscribeCommand')).toEqual([
      { SubscriptionArn: `${TOPIC}:mine` },
    ]);
    expect(store.has('ops.pagerduty_sub')).toBe(false);
  });

  it('publishes a CloudWatch-shaped test alarm to the topic only', async () => {
    const { svc, calls } = pager(URL_A, []);
    await svc.publishTest(new Date('2026-10-25T10:00:00Z'));
    const [pub] = calls('PublishCommand') as {
      TopicArn: string;
      Message: string;
    }[];
    expect(pub.TopicArn).toBe(TOPIC);
    expect(JSON.parse(pub.Message)).toMatchObject({
      AlarmName: 'lawbid-test-page',
      NewStateValue: 'ALARM',
    });
  });
});

describe('AwsBudgetsAdminService guards', () => {
  const make = () => {
    const svc = new AwsBudgetsAdminService({
      get: (k: string) =>
        ({
          OPS_BUDGET_NAME: 'lawbid-prod-monthly',
          OPS_AWS_ACCOUNT_ID: '111122223333',
        })[k],
    } as never);
    const send = jest.fn(
      (cmd: { constructor: { name: string }; input?: unknown }) => {
        if (cmd.constructor.name === 'DescribeBudgetCommand') {
          return Promise.resolve({
            Budget: {
              BudgetName: 'lawbid-prod-monthly',
              BudgetLimit: { Amount: '200', Unit: 'USD' },
              TimeUnit: 'MONTHLY',
              BudgetType: 'COST',
              CalculatedSpend: { ActualSpend: { Amount: '1', Unit: 'USD' } },
            },
          });
        }
        if (cmd.constructor.name === 'DescribeBudgetsCommand') {
          return Promise.resolve({
            Budgets: [
              {
                BudgetName: 'lawbid-prod-monthly',
                BudgetLimit: { Amount: '200' },
                CalculatedSpend: {
                  ActualSpend: { Amount: '12.5' },
                  ForecastedSpend: { Amount: '90' },
                },
                TimeUnit: 'MONTHLY',
              },
              {
                BudgetName: 'LawBid Monthly',
                BudgetLimit: { Amount: '50' },
                TimeUnit: 'MONTHLY',
              },
            ],
          });
        }
        return Promise.resolve({});
      },
    );
    (svc as unknown as { client: unknown }).client = { send };
    return { svc, send };
  };

  it('lists budgets and flags the prod and the obsolete one', async () => {
    const rows = await make().svc.list(true);
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'lawbid-prod-monthly',
        limitUsd: 200,
        actualUsd: 12.5,
        forecastUsd: 90,
        prod: true,
        obsolete: false,
      }),
      expect.objectContaining({
        name: 'LawBid Monthly',
        limitUsd: 50,
        obsolete: true,
        prod: false,
      }),
    ]);
  });

  it('changes only the prod limit and keeps the rest of the budget', async () => {
    const { svc, send } = make();
    await svc.setLimit('lawbid-prod-monthly', 300);
    const upd = send.mock.calls.find(
      (c) => c[0].constructor.name === 'UpdateBudgetCommand',
    )![0].input as { NewBudget: Record<string, unknown> };
    expect(upd.NewBudget.BudgetLimit).toEqual({
      Amount: '300.00',
      Unit: 'USD',
    });
    expect(upd.NewBudget.BudgetName).toBe('lawbid-prod-monthly');
    expect(upd.NewBudget.CalculatedSpend).toBeUndefined();
    await expect(svc.setLimit('LawBid Monthly', 10)).rejects.toThrow();
  });

  it('deletes only the obsolete budget, never the prod one', async () => {
    const { svc, send } = make();
    await expect(svc.remove('lawbid-prod-monthly')).rejects.toThrow();
    await expect(svc.remove('something-else')).rejects.toThrow();
    await svc.remove('LawBid Monthly');
    expect(
      send.mock.calls.filter(
        (c) => c[0].constructor.name === 'DeleteBudgetCommand',
      ),
    ).toHaveLength(1);
  });
});

describe('splitRecordType', () => {
  it('treats Credit and Refund as credits, everything else as the bill', () => {
    expect(splitRecordType('Usage', 10)).toEqual({ gross: 10, credits: 0 });
    expect(splitRecordType('Credit', -4)).toEqual({ gross: 0, credits: 4 });
    expect(splitRecordType('Tax', 1)).toEqual({ gross: 1, credits: 0 });
  });
});

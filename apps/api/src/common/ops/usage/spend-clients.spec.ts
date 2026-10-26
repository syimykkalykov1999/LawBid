import {
  fetchBunnySpend,
  fetchR2Usage,
  fetchStripeFees,
  fetchTwilioSpend,
} from './spend-clients';

const json = (body: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve(body) }) as never;

const NOW = new Date('2026-10-10T12:00:00Z');

describe('Twilio spend', () => {
  it('reads this / last month by category, the daily trend and the balance', async () => {
    const fetchFn = jest.fn((url: string) => {
      if (url.includes('/ThisMonth.json')) {
        return json({
          usage_records: [
            { category: 'totalprice', price: '12.50' },
            { category: 'sms', price: '9.00' },
            { category: 'sms-messages-carrierfees', price: '3.50' },
            { category: 'verify', price: '0' },
          ],
        });
      }
      if (url.includes('/LastMonth.json')) {
        return json({
          usage_records: [{ category: 'totalprice', price: '20.00' }],
        });
      }
      if (url.includes('/Daily.json')) {
        return json({
          usage_records: [
            { category: 'totalprice', price: '1.5', start_date: '2026-10-02' },
            { category: 'totalprice', price: '1.0', start_date: '2026-10-01' },
          ],
        });
      }
      return json({ balance: '41.20', currency: 'USD' });
    });
    const r = await fetchTwilioSpend('ACx', 'tok', NOW, fetchFn as never);
    expect(r.thisMonth.total).toBe(12.5);
    expect(r.thisMonth.byCategory).toEqual([
      { category: 'sms', usd: 9 },
      { category: 'sms-messages-carrierfees', usd: 3.5 },
    ]);
    expect(r.lastMonth.total).toBe(20);
    expect(r.daily.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02']);
    expect(r.balanceUsd).toBe(41.2);
    const auth = (
      fetchFn.mock.calls[0] as unknown as [
        string,
        { headers: Record<string, string> },
      ]
    )[1].headers.authorization;
    expect(auth).toBe(`Basic ${Buffer.from('ACx:tok').toString('base64')}`);
  });

  it('a missing balance is not fatal', async () => {
    const fetchFn = jest.fn((url: string) =>
      url.includes('Balance')
        ? json({}, false, 404)
        : json({ usage_records: [] }),
    );
    const r = await fetchTwilioSpend('ACx', 'tok', NOW, fetchFn as never);
    expect(r.balanceUsd).toBeNull();
  });
});

describe('Bunny billing', () => {
  it('reads this month charges and the balance', async () => {
    const fetchFn = jest
      .fn()
      .mockReturnValue(json({ Balance: 18.4, ThisMonthCharges: 3.25 }));
    const r = await fetchBunnySpend('key', fetchFn as never);
    expect(r).toEqual({ thisMonthUsd: 3.25, balanceUsd: 18.4 });
    expect(fetchFn.mock.calls[0][0]).toBe('https://api.bunny.net/billing');
  });

  it('fails with a short message on an error status', async () => {
    await expect(
      fetchBunnySpend(
        'key',
        jest.fn().mockReturnValue(json({}, false, 401)) as never,
      ),
    ).rejects.toThrow('401');
  });
});

describe('Stripe fees', () => {
  it('adds the fee of each charge and the stripe_fee rows, per month and per day', async () => {
    const t = (iso: string) => Math.floor(Date.parse(iso) / 1000);
    const fetchFn = jest.fn().mockReturnValue(
      json({
        has_more: false,
        data: [
          {
            id: 'a',
            type: 'charge',
            fee: 320,
            currency: 'usd',
            created: t('2026-10-05T10:00:00Z'),
          },
          {
            id: 'b',
            type: 'stripe_fee',
            amount: -500,
            fee: 0,
            currency: 'usd',
            created: t('2026-10-06T10:00:00Z'),
          },
          {
            id: 'c',
            type: 'charge',
            fee: 100,
            currency: 'usd',
            created: t('2026-09-20T10:00:00Z'),
          },
          {
            id: 'd',
            type: 'charge',
            fee: 77,
            currency: 'eur',
            created: t('2026-10-07T10:00:00Z'),
          },
        ],
      }),
    );
    const r = await fetchStripeFees('sk_live_x', NOW, fetchFn as never);
    expect(r.thisMonthUsd).toBe(8.2);
    expect(r.lastMonthUsd).toBe(1);
    expect(r.skippedCurrencies).toEqual(['eur']);
    expect(r.truncated).toBe(false);
    expect(r.daily.find((d) => d.date === '2026-10-06')!.usd).toBe(5);
  });

  it('stops after a safe number of pages and says the figure is a lower bound', async () => {
    const fetchFn = jest.fn().mockReturnValue(
      json({
        has_more: true,
        data: [
          {
            id: 'x',
            type: 'charge',
            fee: 1,
            currency: 'usd',
            created: Math.floor(NOW.getTime() / 1000),
          },
        ],
      }),
    );
    const r = await fetchStripeFees('sk_live_x', NOW, fetchFn as never);
    expect(r.truncated).toBe(true);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(12);
  });
});

describe('Cloudflare R2 usage', () => {
  it('sums storage and splits operations into class A / B', async () => {
    const fetchFn = jest.fn().mockReturnValue(
      json({
        data: {
          viewer: {
            accounts: [
              {
                storage: [{ max: { payloadSize: 2e9, metadataSize: 1e9 } }],
                ops: [
                  {
                    sum: { requests: 100 },
                    dimensions: { actionType: 'PutObject' },
                  },
                  {
                    sum: { requests: 900 },
                    dimensions: { actionType: 'GetObject' },
                  },
                  {
                    sum: { requests: 50 },
                    dimensions: { actionType: 'DeleteObject' },
                  },
                ],
              },
            ],
          },
        },
      }),
    );
    const r = await fetchR2Usage('acc', 'tok', NOW, fetchFn as never);
    expect(r).toEqual({ storageGb: 3, classAOps: 100, classBOps: 900 });
  });

  it('GraphQL errors become a short message without the token', async () => {
    const fetchFn = jest
      .fn()
      .mockReturnValue(json({ errors: [{ message: 'not authorized' }] }));
    await expect(
      fetchR2Usage('acc', 'secret-token', NOW, fetchFn as never),
    ).rejects.toThrow(/not authorized/);
  });
});

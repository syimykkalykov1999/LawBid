import { ConsultationsService } from './consultations.service';

/**
 * Row 69 (KE 123): the reschedule transaction calls loadBookable(.., tx).
 * Its settingsOf ran six reads on the ROOT client in parallel there (up to
 * six more pool connections while the transaction held one). They run on
 * the transaction now; outside a transaction nothing changes.
 */
describe('ConsultationsService.loadBookable inside a transaction (row 69)', () => {
  const thrower = () =>
    jest.fn(() => {
      throw new Error('root client used inside a transaction');
    });
  const models = [
    'consultationSettings',
    'consultationWindow',
    'consultationTimeOff',
    'user',
    'attorneyProfile',
  ];
  const root: Record<string, Record<string, jest.Mock>> = {};
  for (const m of models) {
    root[m] = {
      findUnique: thrower(),
      findMany: thrower(),
      findFirst: thrower(),
    };
  }
  const isActive = jest.fn((...a: unknown[]) =>
    Promise.resolve(a[1] !== undefined),
  );
  const svc = new ConsultationsService(
    root as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { isActive } as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const tx = {
    consultationSettings: {
      findUnique: jest.fn(() =>
        Promise.resolve({ enabled: true, auto_confirm: true }),
      ),
    },
    consultationWindow: {
      findMany: jest.fn(() =>
        Promise.resolve([{ weekday: 1, start_minute: 540, end_minute: 1020 }]),
      ),
    },
    consultationTimeOff: { findMany: jest.fn(() => Promise.resolve([])) },
    user: {
      findUnique: jest.fn(() => Promise.resolve({ timezone: 'UTC' })),
      findFirst: jest.fn(() => Promise.resolve({ id: 'a1' })),
    },
    attorneyProfile: {
      findUnique: jest.fn(() =>
        Promise.resolve({ verification_status: 'verified' }),
      ),
    },
  };

  it('every settings read goes through the transaction', async () => {
    const out = await (
      svc as unknown as {
        loadBookable(
          id: string,
          db: unknown,
        ): Promise<{ autoConfirm: boolean }>;
      }
    ).loadBookable('a1', tx);
    expect(out.autoConfirm).toBe(true);
    expect(tx.consultationSettings.findUnique).toHaveBeenCalled();
    expect(tx.consultationWindow.findMany).toHaveBeenCalled();
    expect(tx.consultationTimeOff.findMany).toHaveBeenCalled();
    expect(tx.user.findUnique).toHaveBeenCalled();
    expect(tx.attorneyProfile.findUnique).toHaveBeenCalled();
    expect(isActive).toHaveBeenCalledWith('a1', tx);
    for (const m of models) {
      for (const fn of Object.values(root[m]))
        expect(fn).not.toHaveBeenCalled();
    }
  });
});

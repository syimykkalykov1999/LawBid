import { demoContext, isDemoPassthroughPath, wantsDemo } from './demo-context';
import { demoDenyProxy, demoNoop } from './demo-guards';

describe('demo context', () => {
  it('is off by default and on inside runDemo, including async continuations', async () => {
    expect(demoContext.isDemo()).toBe(false);
    await demoContext.runDemo(async () => {
      expect(demoContext.isDemo()).toBe(true);
      await new Promise((r) => setTimeout(r, 1));
      expect(demoContext.isDemo()).toBe(true);
    });
    expect(demoContext.isDemo()).toBe(false);
  });

  it('reads the header and leaves reference endpoints on the real database', () => {
    expect(wantsDemo({ 'x-lawbid-demo': '1' })).toBe(true);
    expect(wantsDemo({})).toBe(false);
    expect(isDemoPassthroughPath('/api/v1/i18n/bundle?lang=ru')).toBe(true);
    expect(isDemoPassthroughPath('/api/v1/cases')).toBe(false);
  });

  it('deny proxy throws only in demo context; noop skips only in demo context', async () => {
    const stripe = demoDenyProxy({ charge: () => 'charged' }, 'Payments');
    expect(stripe.charge()).toBe('charged');
    expect(() => demoContext.runDemo(() => stripe.charge())).toThrow(
      /not available in demo mode/,
    );
    const sent: string[] = [];
    const mail = demoNoop(
      { sendEmail: (to: string) => Promise.resolve(void sent.push(to)) },
      ['sendEmail'],
    );
    await mail.sendEmail('real@example.com');
    await demoContext.runDemo(() => mail.sendEmail('demo@example.com'));
    expect(sent).toEqual(['real@example.com']);
  });
});

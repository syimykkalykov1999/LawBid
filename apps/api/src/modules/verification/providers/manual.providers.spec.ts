import {
  ManualBarLookupProvider,
  ManualIdVerificationProvider,
} from './manual.providers';

describe('manual verification providers (docs/03 stage 3.1)', () => {
  it('bar lookup always defers to a human verifier', async () => {
    const out = await new ManualBarLookupProvider().lookup();
    expect(out.result).toBe('manual_review');
  });

  it('ID check always defers to a human verifier', async () => {
    const out = await new ManualIdVerificationProvider().verify();
    expect(out.result).toBe('manual_review');
  });
});

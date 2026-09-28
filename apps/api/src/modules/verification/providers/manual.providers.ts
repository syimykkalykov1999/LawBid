import { Injectable } from '@nestjs/common';
import type {
  BarLookupProvider,
  CheckOutcome,
  IdVerificationProvider,
} from './verification-providers';

const MANUAL: CheckOutcome = {
  result: 'manual_review',
  details: { provider: 'manual', reason: 'automatic check disabled' },
};

/** No automatic bar lookup — a verifier checks by hand (flag off). */
@Injectable()
export class ManualBarLookupProvider implements BarLookupProvider {
  readonly name = 'manual';

  lookup(): Promise<CheckOutcome> {
    return Promise.resolve(MANUAL);
  }
}

/** No automatic ID/selfie check — a verifier compares (flags off). */
@Injectable()
export class ManualIdVerificationProvider implements IdVerificationProvider {
  readonly name = 'manual';

  verify(): Promise<CheckOutcome> {
    return Promise.resolve(MANUAL);
  }

  matchFace(): Promise<CheckOutcome> {
    return Promise.resolve(MANUAL);
  }
}

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

/** Stage 3.1 stub: no automatic bar lookup — a verifier checks by hand. */
@Injectable()
export class ManualBarLookupProvider implements BarLookupProvider {
  readonly name = 'manual';

  lookup(): Promise<CheckOutcome> {
    return Promise.resolve(MANUAL);
  }
}

/** Stage 3.1 stub: no automatic ID/selfie check — a verifier compares. */
@Injectable()
export class ManualIdVerificationProvider implements IdVerificationProvider {
  readonly name = 'manual';

  verify(): Promise<CheckOutcome> {
    return Promise.resolve(MANUAL);
  }
}

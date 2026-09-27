import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from '../../../common/errors/error-code.enum';

export interface CaseStateInput {
  stateCode: string;
  isPrimary: boolean;
}

/** docs/02_DATABASE.md §4.D: 1 primary + up to 2 additional states, no
 * duplicates. The DB enforces "at most one primary" (partial UQ); the
 * count and "exactly one" live here because CockroachDB 24.1 has no
 * triggers. Every case write path must call this before inserting
 * case_states (file 04, stage 4.2). */
export function validateCaseStates(states: CaseStateInput[]): string {
  const codes = new Set(states.map((s) => s.stateCode));
  const primaries = states.filter((s) => s.isPrimary);
  if (
    states.length < 1 ||
    states.length > 3 ||
    codes.size !== states.length ||
    primaries.length !== 1
  ) {
    throw new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'A case needs one primary state and at most two more.',
      details: { field: 'states' },
    });
  }
  return primaries[0].stateCode;
}

import { validateCaseStates } from './case-states.rule';

describe('validateCaseStates (docs/02_DATABASE.md §4.D)', () => {
  const s = (stateCode: string, isPrimary = false) => ({
    stateCode,
    isPrimary,
  });

  it('returns the primary state for 1..3 states with exactly one primary', () => {
    expect(validateCaseStates([s('NY', true)])).toBe('NY');
    expect(validateCaseStates([s('NJ'), s('NY', true), s('CT')])).toBe('NY');
  });

  it.each([
    ['no states', []],
    ['more than 3', [s('NY', true), s('NJ'), s('CT'), s('PA')]],
    ['no primary', [s('NY'), s('NJ')]],
    ['two primaries', [s('NY', true), s('NJ', true)]],
    ['duplicates', [s('NY', true), s('NY')]],
  ])('rejects %s', (_label, states) => {
    expect(() => validateCaseStates(states)).toThrow();
  });
});

import { infraWritesOff } from './infra-writes';

describe('infraWritesOff (row 204, task_role_split)', () => {
  it('is on when the variable is missing (local, CI, the old shared role)', () => {
    expect(infraWritesOff({})).toBe(false);
    expect(infraWritesOff({ OPS_INFRA_WRITES: '' })).toBe(false);
    expect(infraWritesOff({ OPS_INFRA_WRITES: 'on' })).toBe(false);
  });

  it('is off only for the exact word Terraform writes on the public api', () => {
    expect(infraWritesOff({ OPS_INFRA_WRITES: 'off' })).toBe(true);
    expect(infraWritesOff({ OPS_INFRA_WRITES: ' OFF ' })).toBe(true);
  });
});

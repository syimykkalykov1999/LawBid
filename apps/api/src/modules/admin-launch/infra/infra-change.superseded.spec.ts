import { failureSuperseded } from './infra-change.logic';

/**
 * Owner 15.11 («Вкл»/«Выкл» must work for every cloud row; failed rows like
 * «Копии базы … Не получилось» never cleared). A failed request is never
 * written to growth.auto.tfvars.json on main (the record step runs only after
 * a successful apply), so the next successful apply — of ANY item, every plan
 * is the whole stack — puts the cloud back to the file. From then on that
 * failure is history, not the row's state.
 */
describe('a failure superseded by a later successful apply', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 10, 14, h));
  const failed = { status: 'failed', finishedAt: at(1) };

  it('a later «done» of any item supersedes it', () => {
    expect(failureSuperseded(failed, at(3))).toBe(true);
  });
  it('no later success: the failure stays visible', () => {
    expect(failureSuperseded(failed, at(0))).toBe(false);
    expect(failureSuperseded(failed, null)).toBe(false);
  });
  it('only failures, and only finished ones', () => {
    expect(
      failureSuperseded({ status: 'done', finishedAt: at(1) }, at(3)),
    ).toBe(false);
    expect(
      failureSuperseded({ status: 'failed', finishedAt: null }, at(3)),
    ).toBe(false);
  });
});

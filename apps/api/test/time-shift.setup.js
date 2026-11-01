// CI audit 2026-11-01: time-bomb detector. With TIME_SHIFT_DAYS=N every `new Date()`
// and Date.now() in a unit test is N days in the future, so a spec that hides a fixed
// calendar date (`new Date('2026-10-22')` compared with "now", a month-boundary key)
// fails on a nightly run weeks BEFORE it turns main red. Not loaded unless asked:
//   TIME_SHIFT_DAYS=45 npx jest --setupFiles <rootDir>/../test/time-shift.setup.js
// Fake timers installed by a spec replace this Date on purpose (they pin their own now).
const days = Number(process.env.TIME_SHIFT_DAYS || 0);
if (days) {
  const OriginalDate = Date;
  const offset = days * 86_400_000;
  class ShiftedDate extends OriginalDate {
    constructor(...args) {
      if (args.length === 0) super(OriginalDate.now() + offset);
      else super(...args);
    }
    static now() {
      return OriginalDate.now() + offset;
    }
  }
  global.Date = ShiftedDate;
}

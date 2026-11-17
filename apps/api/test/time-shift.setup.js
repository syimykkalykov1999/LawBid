// CI audit 2026-11-01: time-bomb detector. With TIME_SHIFT_DAYS=N every `new Date()`
// and Date.now() in a unit test is N days in the future, so a spec that hides a fixed
// calendar date (`new Date('2026-10-22')` compared with "now", a month-boundary key)
// fails on a nightly run weeks BEFORE it turns main red. Not loaded unless asked:
//   TIME_SHIFT_DAYS=45 npx jest --setupFiles <rootDir>/../test/time-shift.setup.js
// Fake timers installed by a spec replace this Date on purpose (they pin their own now).
// 17.11 (KNOWN_ERRORS 191): TIME_AT_UTC=HH:MM:SS also moves the clock to that wall time
// of the (shifted) day, e.g. 23:59:30 catches a spec whose window ends at 23:59 UTC.
const days = Number(process.env.TIME_SHIFT_DAYS || 0);
const atUtc = /^(\d{2}):(\d{2}):(\d{2})$/.exec(process.env.TIME_AT_UTC || '');
if (days || atUtc) {
  const OriginalDate = Date;
  let offset = days * 86_400_000;
  if (atUtc) {
    const t = new OriginalDate(OriginalDate.now() + offset);
    const target = OriginalDate.UTC(
      t.getUTCFullYear(),
      t.getUTCMonth(),
      t.getUTCDate(),
      Number(atUtc[1]),
      Number(atUtc[2]),
      Number(atUtc[3]),
    );
    offset += target - t.getTime();
  }
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

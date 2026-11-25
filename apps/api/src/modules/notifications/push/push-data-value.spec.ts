import { pushDataValue } from './push-dispatcher';

describe('pushDataValue (push data are strings only)', () => {
  it('keeps strings, writes finite numbers as digits, drops the rest', () => {
    expect(pushDataValue('r-1')).toBe('r-1');
    // owner row 87: the hotline notice's «until when» reaches the phone
    expect(pushDataValue(1795579271328)).toBe('1795579271328');
    expect(pushDataValue(Number.NaN)).toBeUndefined();
    expect(pushDataValue(null)).toBeUndefined();
    expect(pushDataValue({ a: 1 })).toBeUndefined();
    expect(pushDataValue(true)).toBeUndefined();
  });
});

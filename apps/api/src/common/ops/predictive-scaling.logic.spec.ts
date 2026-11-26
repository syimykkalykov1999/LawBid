import {
  dailyErrors,
  decidePredictive,
  predictiveNote,
  predictiveSetting,
  type DayError,
} from './predictive-scaling.logic';

const NOW = new Date('2026-11-25T10:30:00Z');
const H = 3_600_000;

/** Hourly points of whole days before NOW (`days` days back). */
function hours(days: number, f: (i: number) => number) {
  const start = Date.parse('2026-11-25T00:00:00Z') - days * 24 * H;
  return Array.from({ length: days * 24 }, (_, i) => ({
    t: new Date(start + i * H),
    v: f(i),
  }));
}

function goodDays(n: number, err = 5): DayError[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(
      Date.parse('2026-11-24T00:00:00Z') - (n - 1 - i) * 24 * H,
    );
    return { day: d.toISOString().slice(0, 10), errorPct: err, hours: 24 };
  });
}

describe('predictive scaling: the forecast error of a day (WAPE)', () => {
  it('sum |forecast - actual| / sum actual, per whole UTC day', () => {
    const actual = hours(2, () => 100);
    const forecast = hours(2, (i) => (i < 24 ? 110 : 80));
    const days = dailyErrors(forecast, actual, NOW);
    expect(days).toEqual([
      { day: '2026-11-23', errorPct: 10, hours: 24 },
      { day: '2026-11-24', errorPct: 20, hours: 24 },
    ]);
  });

  it('today, half days and days without traffic do not count', () => {
    const actual = [
      ...hours(1, (i) => (i < 10 ? 50 : NaN)), // 10 hours only
      { t: new Date('2026-11-25T01:00:00Z'), v: 50 }, // today
    ];
    const forecast = [...hours(1, () => 50), { t: actual[10].t, v: 60 }];
    expect(dailyErrors(forecast, actual, NOW)).toEqual([]);
    expect(
      dailyErrors(
        hours(1, () => 5),
        hours(1, () => 0),
        NOW,
      ),
    ).toEqual([]);
  });

  it('a quiet night hour does not blow the day up (weighted, not a mean of %)', () => {
    // 23 busy hours exact, one hour with 1 request forecast as 10 (+900 %).
    const actual = hours(1, (i) => (i === 3 ? 1 : 1000));
    const forecast = hours(1, (i) => (i === 3 ? 10 : 1000));
    expect(dailyErrors(forecast, actual, NOW)[0].errorPct).toBeLessThan(0.1);
  });
});

describe('predictive scaling: Выкл / Прогноз / Вкл / Авто', () => {
  it('unknown or misspelt = forecast only (never adds tasks)', () => {
    expect(predictiveSetting('Auto ')).toBe('auto');
    expect(predictiveSetting('on')).toBe('on');
    for (const v of ['off', 'forecast', 'maybe', '', undefined, 3]) {
      expect(predictiveSetting(v)).toBe('forecast');
    }
  });

  it('forecast and on are what they say', () => {
    expect(
      decidePredictive(
        'forecast',
        goodDays(30),
        20,
        14,
        'ForecastAndScale',
        NOW,
      ).mode,
    ).toBe('ForecastOnly');
    expect(decidePredictive('on', [], 20, 14, 'ForecastOnly', NOW).mode).toBe(
      'ForecastAndScale',
    );
  });

  it('auto scales after N good whole days in a row, AWS «evaluate first»', () => {
    expect(
      decidePredictive('auto', goodDays(13), 20, 14, 'ForecastOnly', NOW),
    ).toEqual({
      mode: 'ForecastOnly',
      reason: 'auto_not_enough_days',
    });
    expect(
      decidePredictive('auto', goodDays(14), 20, 14, 'ForecastOnly', NOW),
    ).toEqual({
      mode: 'ForecastAndScale',
      reason: 'auto_good_days',
    });
  });

  it('auto: one bad day in the window keeps forecast only', () => {
    const d = goodDays(14);
    d[5] = { ...d[5], errorPct: 35 };
    expect(
      decidePredictive('auto', d, 20, 14, 'ForecastOnly', NOW).reason,
    ).toBe('auto_error_high');
  });

  it('auto: a gap (a day not measured) is not trusted', () => {
    const d = goodDays(15);
    d.splice(7, 1);
    expect(decidePredictive('auto', d, 20, 14, 'ForecastOnly', NOW).mode).toBe(
      'ForecastOnly',
    );
  });

  it('auto while on: stays on after a good day, back to forecast after a bad one or a missing day', () => {
    expect(
      decidePredictive('auto', goodDays(3), 20, 14, 'ForecastAndScale', NOW)
        .reason,
    ).toBe('auto_stays_on');
    const bad = goodDays(3);
    bad[2] = { ...bad[2], errorPct: 21 };
    expect(
      decidePredictive('auto', bad, 20, 14, 'ForecastAndScale', NOW).mode,
    ).toBe('ForecastOnly');
    const old = goodDays(3).slice(0, 2); // yesterday missing
    expect(
      decidePredictive('auto', old, 20, 14, 'ForecastAndScale', NOW).mode,
    ).toBe('ForecastOnly');
  });

  it('the note says the mode, the last error and the threshold in plain Russian', () => {
    const d = goodDays(5, 12.5);
    const note = predictiveNote(
      decidePredictive('auto', d, 20, 14, 'ForecastOnly', NOW),
      d,
      20,
      14,
    );
    expect(note).toContain('Только прогноз');
    expect(note).toContain('12.5 %');
    expect(note).toContain('5 из 14');
  });
});

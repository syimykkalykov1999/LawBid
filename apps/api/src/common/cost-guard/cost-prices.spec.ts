import { parsePriceBook, unitUsdPerCall } from './cost-prices';

describe('parsePriceBook / unitUsdPerCall (S9-2: one price book)', () => {
  it('list prices when nothing is overridden', () => {
    expect(unitUsdPerCall('sms')).toBeCloseTo(0.0115, 6);
    // 500 nominal characters × 2 millicents = $0.01 a translation
    expect(unitUsdPerCall('translate')).toBeCloseTo(0.01, 6);
    expect(unitUsdPerCall('id_check')).toBeCloseTo(1.5, 6);
    expect(unitUsdPerCall('video')).toBeCloseTo(0.005, 6);
  });

  it('reads per-provider keys and the JSON forms, ignores junk', () => {
    const b = parsePriceBook({
      'cost.unit_millicents.sms': 2000,
      'cost.unit_millicents': { translate: 4, video: 'x', email: -1 },
      'cost.sms_millicents.kz': 9000,
      'cost.sms_country_millicents': { ru: 7000 },
    });
    expect(b.unit).toEqual({ sms: 2000, translate: 4 });
    expect(b.sms).toEqual({ KZ: 9000, RU: 7000 });
    expect(unitUsdPerCall('translate', b)).toBeCloseTo(0.02, 6);
  });
});

import { browserLabel, maskIp } from './qr-login.service';

describe('QR login helpers', () => {
  it('names the browser and system from a User-Agent', () => {
    expect(
      browserLabel(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      ),
    ).toBe('Chrome · macOS');
    expect(
      browserLabel(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      ),
    ).toBe('Edge · Windows');
    expect(
      browserLabel(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      ),
    ).toBe('Safari · iOS');
    expect(browserLabel('curl/8.0')).toBeNull();
    expect(browserLabel(undefined)).toBeNull();
  });

  it('hides the last part of the address', () => {
    expect(maskIp('203.0.113.45')).toBe('203.0.113.x');
    expect(maskIp('::ffff:203.0.113.45')).toBe('203.0.113.x');
    expect(maskIp('2001:db8:85a3::8a2e:370:7334')).toBe('2001:db8::');
    expect(maskIp(null)).toBeNull();
    expect(maskIp('garbage')).toBeNull();
  });
});

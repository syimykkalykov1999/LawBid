import { createServer, type Server } from 'node:net';
import {
  ClamdScanner,
  DevEicarScanner,
  EICAR_SIGNATURE,
  parseClamdReply,
  selectVirusScanner,
} from './virus-scanner';

describe('VirusScanner', () => {
  it('selects clamd when CLAMAV_HOST is set, dev scanner only in dev/test, none otherwise', () => {
    expect(
      selectVirusScanner({
        nodeEnv: 'production',
        clamavHost: 'clamav',
        clamavPort: 3310,
      })?.name,
    ).toBe('clamd');
    expect(selectVirusScanner({ nodeEnv: 'development' })?.name).toBe(
      'dev-eicar',
    );
    expect(selectVirusScanner({ nodeEnv: 'test' })?.name).toBe('dev-eicar');
    expect(selectVirusScanner({ nodeEnv: 'production' })).toBeNull();
    expect(selectVirusScanner({ nodeEnv: 'staging' })).toBeNull();
  });

  it('dev scanner flags EICAR anywhere and passes other content', async () => {
    const s = new DevEicarScanner();
    expect(await s.scan(Buffer.from(`%PDF-1.4\n${EICAR_SIGNATURE}\n`))).toEqual(
      {
        infected: true,
        signature: 'Eicar-Test-Signature',
      },
    );
    expect(await s.scan(Buffer.from('%PDF-1.4 clean'))).toEqual({
      infected: false,
    });
  });

  it('parses clamd replies', () => {
    expect(parseClamdReply('stream: OK\0')).toEqual({ infected: false });
    expect(parseClamdReply('stream: Win.Test.EICAR_HDB-1 FOUND\0')).toEqual({
      infected: true,
      signature: 'Win.Test.EICAR_HDB-1',
    });
    expect(() =>
      parseClamdReply('INSTREAM size limit exceeded. ERROR\0'),
    ).toThrow(/clamd error/);
  });

  describe('ClamdScanner over TCP', () => {
    let server: Server;
    let port = 0;
    let received = Buffer.alloc(0);

    beforeAll(async () => {
      server = createServer((sock) => {
        const parts: Buffer[] = [];
        sock.on('data', (d: Buffer) => {
          parts.push(d);
          const all = Buffer.concat(parts);
          // command + chunks, terminated by a zero-length chunk
          if (all.length >= 14 && all.subarray(-4).equals(Buffer.alloc(4))) {
            received = all;
            const body = all.subarray('zINSTREAM\0'.length);
            sock.end(
              body.includes('EICAR')
                ? 'stream: Eicar-Signature FOUND\0'
                : 'stream: OK\0',
            );
          }
        });
      });
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
      port = (server.address() as { port: number }).port;
    });

    afterAll(async () => {
      await new Promise<void>((r) => server.close(() => r()));
    });

    it('streams length-prefixed chunks and reports the verdict', async () => {
      const scanner = new ClamdScanner('127.0.0.1', port);
      expect(await scanner.scan(Buffer.from('clean data'))).toEqual({
        infected: false,
      });
      expect(received.subarray(0, 10).toString()).toBe('zINSTREAM\0');
      expect(received.readUInt32BE(10)).toBe('clean data'.length);
      expect(await scanner.scan(Buffer.from(EICAR_SIGNATURE))).toEqual({
        infected: true,
        signature: 'Eicar-Signature',
      });
    });

    it('rejects when clamd is unreachable', async () => {
      await expect(
        new ClamdScanner('127.0.0.1', 1, 2000).scan(Buffer.from('x')),
      ).rejects.toThrow();
    });
  });
});

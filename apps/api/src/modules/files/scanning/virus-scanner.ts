import { connect, type Socket } from 'node:net';

export type ScanVerdict =
  { infected: false } | { infected: true; signature: string };

/**
 * Antivirus seam (docs/01 §5 "антивирус-скан (ClamAV lambda/сервис)",
 * docs/03 §2.2 scan_status). Throws when the scan itself could not run —
 * the scan job retries and finally marks the file `failed`.
 */
export interface VirusScanner {
  readonly name: string;
  scan(data: Buffer): Promise<ScanVerdict>;
}

/** DI token; the value is `null` when no scanner is available
 * (staging/production without CLAMAV_HOST): files then stay `pending`. */
export const VIRUS_SCANNER = Symbol('VIRUS_SCANNER');

/** The standard EICAR antivirus test string (harmless by design). */
export const EICAR_SIGNATURE =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

/**
 * Development/test stand-in when no clamd is running: flags only the
 * EICAR test signature (anywhere in the file) and passes everything else.
 * NEVER a real scanner — selectVirusScanner() refuses it outside
 * development/test.
 */
export class DevEicarScanner implements VirusScanner {
  readonly name = 'dev-eicar';

  scan(data: Buffer): Promise<ScanVerdict> {
    return Promise.resolve(
      data.includes(EICAR_SIGNATURE, 0, 'latin1')
        ? { infected: true, signature: 'Eicar-Test-Signature' }
        : { infected: false },
    );
  }
}

const CHUNK = 64 * 1024;

/**
 * ClamAV daemon over TCP (`zINSTREAM`): the file is streamed as
 * length-prefixed chunks, clamd answers `stream: OK` or
 * `stream: <Signature> FOUND`. Nothing is written to disk.
 */
export class ClamdScanner implements VirusScanner {
  readonly name = 'clamd';

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly timeoutMs = 60_000,
  ) {}

  scan(data: Buffer): Promise<ScanVerdict> {
    return new Promise<ScanVerdict>((resolve, reject) => {
      const socket: Socket = connect({ host: this.host, port: this.port });
      const replies: Buffer[] = [];
      let settled = false;
      const done = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        fn();
      };
      socket.setTimeout(this.timeoutMs, () =>
        done(() => reject(new Error('clamd timeout'))),
      );
      socket.on('error', (err) => done(() => reject(err)));
      socket.on('data', (chunk: Buffer) => replies.push(chunk));
      socket.on('end', () =>
        done(() => {
          try {
            resolve(parseClamdReply(Buffer.concat(replies).toString('utf8')));
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        }),
      );
      socket.on('connect', () => {
        socket.write('zINSTREAM\0');
        for (let off = 0; off < data.length; off += CHUNK) {
          const part = data.subarray(off, off + CHUNK);
          const len = Buffer.alloc(4);
          len.writeUInt32BE(part.length, 0);
          socket.write(len);
          socket.write(part);
        }
        socket.write(Buffer.alloc(4)); // zero-length chunk = end of stream
      });
    });
  }
}

export function parseClamdReply(raw: string): ScanVerdict {
  const reply = raw.replace(/\0/g, '').trim();
  if (/^stream: OK$/.test(reply)) return { infected: false };
  const found = /^stream: (.+) FOUND$/.exec(reply);
  if (found) return { infected: true, signature: found[1] };
  throw new Error(`clamd error: ${reply.slice(0, 200)}`);
}

/** CLAMAV_HOST set → clamd; else development/test → EICAR-only dev
 * scanner; else (staging/production) → null: no scan, files stay pending. */
export function selectVirusScanner(env: {
  nodeEnv?: string;
  clamavHost?: string;
  clamavPort?: number;
}): VirusScanner | null {
  if (env.clamavHost) {
    return new ClamdScanner(env.clamavHost, env.clamavPort ?? 3310);
  }
  if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
    return new DevEicarScanner();
  }
  return null;
}

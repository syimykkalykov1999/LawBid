import { describe, expect, it } from 'vitest';
import { GUIDES } from './integration-guides';
import { fillFromKeyFile, KEY_FILE_MAX_BYTES, type KeyFileSpec } from './key-file';

const p8: KeyFileSpec = {
  button: 'x',
  accept: '.p8',
  field: 'privateKey',
  marker: '-----BEGIN PRIVATE KEY-----',
  idFromName: { pattern: '^AuthKey_([A-Z0-9]{10})\\.p8$', field: 'keyId' },
};
const PEM = '-----BEGIN PRIVATE KEY-----\r\nMIGTAgEA\r\n-----END PRIVATE KEY-----\r\n';

describe('fillFromKeyFile', () => {
  it('fills the key (LF, trimmed) and the key id from the file name', () => {
    const r = fillFromKeyFile(p8, 'AuthKey_ABC123DEFG.p8', PEM);
    expect(r).toEqual({
      ok: true,
      filled: { privateKey: '-----BEGIN PRIVATE KEY-----\nMIGTAgEA\n-----END PRIVATE KEY-----', keyId: 'ABC123DEFG' },
    });
  });

  it('keeps the id field empty when the name has none (renamed file)', () => {
    const r = fillFromKeyFile(p8, 'key.p8', PEM);
    expect(r.ok && r.filled).toEqual({ privateKey: expect.stringContaining('BEGIN') });
  });

  it('refuses a file without the marker, an empty file and a huge file', () => {
    expect(fillFromKeyFile(p8, 'a.p8', 'hello').ok).toBe(false);
    expect(fillFromKeyFile(p8, 'a.p8', '   ').ok).toBe(false);
    expect(fillFromKeyFile(p8, 'a.p8', PEM + 'x'.repeat(KEY_FILE_MAX_BYTES)).ok).toBe(false);
  });
});

describe('guides with a key file', () => {
  it('point at real fields of their provider', () => {
    for (const [id, g] of Object.entries(GUIDES)) {
      if (!g.keyFile) continue;
      expect(g.fields[g.keyFile.field], `${id}.${g.keyFile.field}`).toBeDefined();
      if (g.keyFile.idFromName) expect(g.fields[g.keyFile.idFromName.field]).toBeDefined();
    }
    expect(Object.values(GUIDES).filter((g) => g.keyFile).length).toBeGreaterThanOrEqual(3);
  });
});

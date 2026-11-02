import { describe, expect, it } from 'vitest';
import { GUIDES } from './integration-guides';
import { fillFromKeyFile, KEY_FILE_MAX_BYTES, type KeyFileSpec } from './key-file';

const p8: KeyFileSpec = {
  button: 'x',
  accept: '.p8',
  field: 'privateKey',
  marker: /-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/,
  idFromName: { pattern: /^AuthKey_([A-Z0-9]{10})(?: \(\d+\))?\.p8$/, field: 'keyId' },
};
// Built at run time so the file holds no PEM-looking literal (gitleaks).
const dash = '-----';
const PEM = `${dash}BEGIN PRIVATE KEY${dash}\r\nMIGTAgEA\r\n${dash}END PRIVATE KEY${dash}\r\n`;

describe('fillFromKeyFile', () => {
  it('fills the key (LF, trimmed) and the key id from the file name', () => {
    const r = fillFromKeyFile(p8, 'AuthKey_ABC123DEFG.p8', PEM);
    expect(r).toEqual({
      ok: true,
      filled: { privateKey: `${dash}BEGIN PRIVATE KEY${dash}\nMIGTAgEA\n${dash}END PRIVATE KEY${dash}`, keyId: 'ABC123DEFG' },
      missing: [],
    });
  });

  it('keeps the id field empty when the name has none (renamed file)', () => {
    const r = fillFromKeyFile(p8, 'key.p8', PEM);
    expect(r.ok && r.filled).toEqual({ privateKey: expect.stringContaining('BEGIN') });
    expect(r.ok && r.missing).toEqual(['keyId']);
  });

  it('reads the id from a browser-renamed duplicate «AuthKey_X (1).p8»', () => {
    const r = fillFromKeyFile(p8, 'AuthKey_ABC123DEFG (1).p8', PEM);
    expect(r.ok && r.filled.keyId).toBe('ABC123DEFG');
  });

  it('refuses an encrypted or truncated key', () => {
    expect(fillFromKeyFile(p8, 'a.p8', `${dash}BEGIN ENCRYPTED PRIVATE KEY${dash}\nx\n${dash}END ENCRYPTED PRIVATE KEY${dash}`).ok).toBe(false);
    expect(fillFromKeyFile(p8, 'a.p8', `${dash}BEGIN PRIVATE KEY${dash}\nMIG`).ok).toBe(false);
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
      // A PEM has line breaks: a single-line input would silently drop them.
      expect(g.fields[g.keyFile.field]?.multiline, `${id} multiline`).toBe(true);
      if (g.keyFile.idFromName) expect(g.fields[g.keyFile.idFromName.field]).toBeDefined();
    }
    expect(Object.values(GUIDES).filter((g) => g.keyFile).length).toBeGreaterThanOrEqual(3);
  });
});

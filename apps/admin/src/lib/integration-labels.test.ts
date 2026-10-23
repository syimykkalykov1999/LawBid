import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GUIDES } from './integration-guides';
import { fieldLabelWithKey, FIELD_ENV, providerDescription, providerLabel } from './integration-labels';

/**
 * Owner 2026-10-22: every integration field shows its original technical
 * name (env / config key) next to the Russian label, and every service has a
 * «Как включить» block. The names come from the API's provider registry; this
 * test reads that file so the admin texts cannot drift from it.
 */
const REGISTRY = path.resolve(__dirname, '../../../api/src/common/secrets/provider-registry.ts');

interface RegField {
  provider: string;
  name: string;
  env: string | null;
}

function readRegistry(): RegField[] {
  const out: RegField[] = [];
  let provider = '';
  let name = '';
  let fieldAt = -1;
  const lines = readFileSync(REGISTRY, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const id = /^ {4}id: '([a-z_]+)',/.exec(line);
    if (id) provider = id[1];
    const field = /^ {8}name: '(\w+)',/.exec(line);
    if (field) {
      name = field[1];
      fieldAt = out.length;
      out.push({ provider, name, env: null });
    }
    const env = /^ {8}env: '(\w+)',/.exec(line);
    if (env && fieldAt >= 0 && i > 0) out[fieldAt].env = env[1];
  });
  return out;
}

describe('integration labels (owner 2026-10-22)', () => {
  const fields = readRegistry();

  it('reads the registry', () => {
    expect(fields.length).toBeGreaterThan(50);
  });

  it('knows the server variable of every field', () => {
    for (const f of fields) {
      if (f.env) expect(FIELD_ENV[`${f.provider}.${f.name}`], `${f.provider}.${f.name}`).toBe(f.env);
    }
  });

  it('shows the original name after the Russian label', () => {
    expect(fieldLabelWithKey('ses', 'region', 'Region')).toBe('Регион (AWS Region) · SES_REGION');
    expect(fieldLabelWithKey('turn', 'secret', 'Shared secret')).toBe('Общий секрет (static-auth-secret) · TURN_SECRET');
    expect(fieldLabelWithKey('google_signin', 'clientIds', 'x')).toContain('GOOGLE_CLIENT_IDS');
    // Already in the label: not repeated.
    const l = fieldLabelWithKey('livekit', 'url', 'x');
    expect(l.match(/LIVEKIT_URL/g)).toHaveLength(1);
  });

  it('every service has Russian texts, a field hint per field and a «Как включить» block', () => {
    const providers = [...new Set(fields.map((f) => f.provider))];
    for (const p of providers) {
      expect(providerLabel(p, 'EN'), p).not.toBe('EN');
      expect(providerDescription(p, 'EN'), p).not.toBe('EN');
      const guide = GUIDES[p];
      expect(guide, `guide for ${p}`).toBeTruthy();
      expect(guide.enable?.length ?? 0, `«Как включить» for ${p}`).toBeGreaterThan(0);
      for (const f of fields.filter((x) => x.provider === p)) {
        expect(guide.fields[f.name], `${p}.${f.name} hint`).toBeTruthy();
      }
    }
  });
});

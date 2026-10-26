import { journalTextAad } from '../../common/secrets/field-aad';
import type { MessageBodyCipher } from '../../common/secrets/message-body-cipher';

/**
 * S3-5: the free-text fields of a case-journal payload. Only these keys
 * are sealed (ids, amounts, statuses and machine reasons stay readable and
 * keep working for JSON filters). A value is either a string or the
 * `{old, new}` pair of a changed field.
 */
export const JOURNAL_TEXT_KEYS: ReadonlySet<string> = new Set([
  'title',
  'description',
  'note',
  'why',
]);

type Json = Record<string, unknown>;

/** Returns a copy of [payload] with its free-text fields sealed
 * (bound to the journal row id). Plaintext when sealing is off. */
export async function sealJournalPayload<T extends Json>(
  payload: T,
  journalId: string,
  cipher: MessageBodyCipher | undefined,
): Promise<T> {
  if (!cipher || !cipher.enabled) return payload;
  const aad = journalTextAad(journalId);
  const out: Json = { ...payload };
  for (const key of Object.keys(out)) {
    if (!JOURNAL_TEXT_KEYS.has(key)) continue;
    const v = out[key];
    if (typeof v === 'string' && v.length > 0) {
      out[key] = await cipher.sealJournalText(v, aad);
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const pair: Json = { ...(v as Json) };
      for (const side of ['old', 'new']) {
        const s = pair[side];
        if (typeof s === 'string' && s.length > 0) {
          pair[side] = await cipher.sealJournalText(s, aad);
        }
      }
      out[key] = pair;
    }
  }
  return out as T;
}

/** Opens every sealed string in a payload (two levels deep); plaintext
 * passes through, so rows written before sealing read unchanged. */
export function openJournalPayload(
  payload: unknown,
  journalId: string,
  cipher: MessageBodyCipher | undefined,
): unknown {
  if (!cipher || !payload || typeof payload !== 'object') return payload;
  const aad = journalTextAad(journalId);
  const walk = (v: unknown, depth: number): unknown => {
    if (typeof v === 'string') return cipher.openField(v, aad);
    if (!v || typeof v !== 'object' || Array.isArray(v) || depth > 2) return v;
    const o: Json = {};
    for (const [k, x] of Object.entries(v as Json)) o[k] = walk(x, depth + 1);
    return o;
  };
  return walk(payload, 0);
}

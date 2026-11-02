/**
 * Owner 2026-11-02: «вставить ключ или файл в админке — и работает». The key
 * files the vendors hand out (.p8 from Apple, .pem from CloudFront / GitHub)
 * were opened in a text editor and pasted by hand. The card now takes the
 * file itself: its text fills the key field, and a key id that sits in the
 * file name (AuthKey_ABC123DEFG.p8) fills its own field. Read in the browser
 * only; nothing but the saved field values goes to the server.
 */
export interface KeyFileSpec {
  button: string;
  /** `accept` of the file input. */
  accept: string;
  /** Field that receives the file text. */
  field: string;
  /** Text every valid file contains, e.g. a PEM header. */
  marker: string;
  /** Field filled from the file name: `pattern` has one capture group. */
  idFromName?: { pattern: string; field: string };
}

/** A key file is a few KB; anything bigger is the wrong file. */
export const KEY_FILE_MAX_BYTES = 16_384;

export type KeyFileResult =
  | { ok: true; filled: Record<string, string> }
  | { ok: false; reason: string };

export function fillFromKeyFile(spec: KeyFileSpec, fileName: string, text: string): KeyFileResult {
  const body = text.replace(/\r\n?/g, '\n').trim();
  if (body.length === 0 || body.length > KEY_FILE_MAX_BYTES || !body.includes(spec.marker)) {
    return { ok: false, reason: 'Это не тот файл. Выберите скачанный файл ключа целиком, не открывая его.' };
  }
  const filled: Record<string, string> = { [spec.field]: body };
  if (spec.idFromName) {
    const m = new RegExp(spec.idFromName.pattern).exec(fileName);
    if (m?.[1]) filled[spec.idFromName.field] = m[1];
  }
  return { ok: true, filled };
}

'use client';

import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';

/**
 * Owner 2026-10-22: passkeys (Face ID / Touch ID / Windows Hello / a
 * hardware key) as the second sign-in step and for step-up, instead of
 * the authenticator code. @simplewebauthn/browser does the base64url and
 * WebAuthn JSON conversions; the API speaks the same JSON shapes
 * (PublicKeyCredential*OptionsJSON in, *ResponseJSON out).
 */

/** Only in a browser that has the WebAuthn API (the button is hidden otherwise). */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined';
}

/** A plain JSON object, as the generated API types describe the request bodies. */
type Json = Record<string, unknown>;

/** The API sends the options as a loose JSON object; the library wants the typed one
 * and answers with the typed AuthenticationResponseJSON, sent back as is. */
export async function signWithPasskey(options: Json): Promise<Json> {
  // Smoothness audit 2026-11-03: the library is fetched when a key prompt is
  // actually needed (login / step-up), not with every page that has a dialog.
  const { startAuthentication } = await import('@simplewebauthn/browser');
  const r = await startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON });
  return { ...r };
}

export async function createPasskey(options: Json): Promise<Json> {
  const { startRegistration } = await import('@simplewebauthn/browser');
  const r = await startRegistration({ optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON });
  return { ...r };
}

/** The admin closed the browser prompt (or it timed out): NotAllowedError, wrapped by the library. */
export function passkeyCancelled(e: unknown): boolean {
  // The library's WebAuthnError carries `code` and the browser error as `cause`
  // (recognised by its `ERROR_*` code so the library need not be loaded just to read an error).
  const err = e as { name?: string; code?: string; cause?: { name?: string } } | null;
  if (typeof err?.code === 'string' && err.code.startsWith('ERROR_')) {
    if (err.code === 'ERROR_CEREMONY_ABORTED') return true;
    return err.cause?.name === 'NotAllowedError';
  }
  return err?.name === 'NotAllowedError';
}

export const PASSKEY_CANCELLED_TEXT = 'Подтверждение ключом отменено. Попробуйте ещё раз или введите код.';

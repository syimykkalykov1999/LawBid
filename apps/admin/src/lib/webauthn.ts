'use client';

import {
  WebAuthnError,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

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
  const r = await startAuthentication({ optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON });
  return { ...r };
}

export async function createPasskey(options: Json): Promise<Json> {
  const r = await startRegistration({ optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON });
  return { ...r };
}

/** The admin closed the browser prompt (or it timed out): NotAllowedError, wrapped by the library. */
export function passkeyCancelled(e: unknown): boolean {
  if (e instanceof WebAuthnError) {
    if (e.code === 'ERROR_CEREMONY_ABORTED') return true;
    return (e.cause as { name?: string } | undefined)?.name === 'NotAllowedError';
  }
  return (e as { name?: string } | null)?.name === 'NotAllowedError';
}

export const PASSKEY_CANCELLED_TEXT = 'Подтверждение ключом отменено. Попробуйте ещё раз или введите код.';

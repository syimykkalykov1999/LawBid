import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SMS_OTP_PURPOSES } from './services/otp.service';

/**
 * Owner rule (memory sms-two-cases, decided, never ask again): an SMS code
 * goes out ONLY at registration (POST /auth/otp/request for a new number)
 * and «Забыл пароль» (POST /auth/password/reset/request). Sign-in is phone +
 * password; a step-up, a new sign-in method or a phone change is confirmed
 * with the password / passkey.
 *
 * This guard fails when any other code path can reach the SMS provider:
 *   1. the provider is injected and called in OtpService only;
 *   2. OtpService texts only the two purposes (runtime check, pinned here);
 *   3. OtpService.requestOtp has a fixed set of callers, and the two
 *      AuthController handlers that reach a phone code are exactly the two
 *      allowed routes;
 *   4. nothing sends a plain (non-code) SMS, and nothing talks to Twilio /
 *      SNS SMS directly.
 * A new SMS case is an owner decision: change this list only with it.
 */
const SRC = join(__dirname, '..', '..');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sourceFiles(path));
    else if (
      name.endsWith('.ts') &&
      !name.endsWith('.spec.ts') &&
      !name.endsWith('.d.ts')
    )
      out.push(path);
  }
  return out;
}

const files = sourceFiles(SRC).map((path) => ({
  rel: relative(SRC, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

/** Files (relative to src/) whose code matches [pattern]. */
function filesMatching(pattern: RegExp): string[] {
  return files
    .filter((f) => pattern.test(f.text))
    .map((f) => f.rel)
    .sort();
}

function file(rel: string): string {
  const found = files.find((f) => f.rel === rel);
  if (!found) throw new Error(`${rel} not found`);
  return found.text;
}

describe('SMS only at registration and «Забыл пароль» (owner rule)', () => {
  it('OtpService texts exactly two purposes: registration and reset', () => {
    expect([...SMS_OTP_PURPOSES]).toEqual(['login', 'reset']);
    const otp = file('modules/auth/services/otp.service.ts');
    // The check sits in front of the provider call, in the phone branch.
    const gate = otp.indexOf('if (!SMS_OTP_PURPOSES.includes(purpose))');
    const send = otp.indexOf('this.smsProvider.send(');
    expect(gate).toBeGreaterThan(0);
    expect(send).toBeGreaterThan(gate);
  });

  it('the SMS provider is injected and called in OtpService only', () => {
    expect(filesMatching(/@Inject\(SMS_PROVIDER\)/)).toEqual([
      'modules/auth/services/otp.service.ts',
    ]);
    expect(filesMatching(/smsProvider\.send\(/)).toEqual([
      'modules/auth/services/otp.service.ts',
    ]);
    expect(
      (
        file('modules/auth/services/otp.service.ts').match(
          /smsProvider\.send\(/g,
        ) ?? []
      ).length,
    ).toBe(1);
  });

  it('OtpService.requestOtp has a fixed set of callers', () => {
    expect(filesMatching(/\.requestOtp\(/)).toEqual([
      'modules/auth/auth.controller.ts', // AuthService.requestOtp (below)
      'modules/auth/auth.service.ts', // registration (new number only)
      'modules/auth/password-auth.service.ts', // «Забыл пароль»
      'modules/users/services/contacts.service.ts', // e-mail only
    ]);
    // «Забыл пароль» asks for the reset purpose.
    expect(file('modules/auth/password-auth.service.ts')).toMatch(
      /this\.otp\.requestOtp\([^)]*'reset'\)/,
    );
    // A contact code is e-mail only: the phone is refused before the send.
    const contacts = file('modules/users/services/contacts.service.ts');
    const refuse = contacts.indexOf(
      "if (type === 'phone') throw phoneByPassword();",
    );
    expect(refuse).toBeGreaterThan(0);
    expect(
      contacts.indexOf("this.otp.requestOtp(type, normalized, 'contact')"),
    ).toBeGreaterThan(refuse);
    // The phone change itself never asks for a code.
    const change = contacts.slice(
      contacts.indexOf('async changePhone('),
      contacts.indexOf('private async commit('),
    );
    expect(change).not.toMatch(/requestOtp|smsProvider|sendText/);
  });

  it('contacts/request|verify refuse a phone before any reauth or code step', () => {
    const users = file('modules/users/controllers/users.controller.ts');
    for (const route of [
      "@Post('contacts/request')",
      "@Post('contacts/verify')",
    ]) {
      const body = users.slice(users.indexOf(route));
      const guard = body.indexOf('this.contacts.assertCodeContact(dto.type);');
      expect(guard).toBeGreaterThan(0);
      for (const next of [
        'this.reauth.assertRecentAuthentication(',
        'this.contacts.requestVerification(',
        'this.contacts.verify(',
      ]) {
        const at = body.indexOf(next);
        if (at >= 0 && at < body.indexOf('@Post(', 10)) {
          expect(at).toBeGreaterThan(guard);
        }
      }
    }
  });

  it('AuthController reaches a phone code from the two allowed routes only', () => {
    const controller = file('modules/auth/auth.controller.ts');
    const routeOf = (call: string): string[] => {
      const routes: string[] = [];
      let at = controller.indexOf(call);
      while (at >= 0) {
        const before = controller.slice(0, at);
        const posts = [...before.matchAll(/@Post\('([^']+)'\)/g)];
        routes.push(posts[posts.length - 1]?.[1] ?? '?');
        at = controller.indexOf(call, at + call.length);
      }
      return routes;
    };
    expect(routeOf('this.auth.requestOtp(')).toEqual(['otp/request']);
    expect(routeOf('this.passwordAuth.requestReset(')).toEqual([
      'password/reset/request',
    ]);
    // No other module calls them.
    expect(filesMatching(/\.requestReset\(/)).toEqual([
      'modules/auth/auth.controller.ts',
    ]);
  });

  it('the registration route texts a NEW number only; other phone purposes are refused', () => {
    const auth = file('modules/auth/auth.service.ts');
    expect(auth).toContain('this.assertSmsOnlyForNewNumber(identifier)');
    expect(auth).toMatch(
      /if \(dto\.channel === 'phone' && purpose !== 'login'\) \{\s*throw new BadRequestException/,
    );
    // A phone is never linked as an extra sign-in method (it would need a code).
    expect(auth).toMatch(
      /if \(dto\.provider === 'phone'\) \{\s*throw new BadRequestException/,
    );
  });

  it('no plain (non-code) SMS is sent, and nothing talks to Twilio / SNS SMS directly', () => {
    // sendNonOtp exists for a future, owner-approved case; nothing calls it.
    expect(filesMatching(/\.sendNonOtp\(/)).toEqual([]);
    expect(filesMatching(/\.sendText\(/)).toEqual([
      'modules/auth/providers/sms/twilio-sms.provider.ts',
      'modules/compliance/sms-compliance.service.ts',
    ]);
    expect(filesMatching(/messages\.create\(/)).toEqual([
      'modules/auth/providers/sms/twilio-sms.provider.ts',
    ]);
    // SNS can text a phone number directly; only topic alarms are allowed.
    expect(filesMatching(/PhoneNumber\s*:/)).toEqual([]);
  });
});

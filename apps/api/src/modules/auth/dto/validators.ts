import {
  registerDecorator,
  isEmail,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
// Full ('max') metadata of the SAME package — needed for getType()
// (premium/toll-free detection); the default 'min' bundle has no types.
import { parsePhoneNumberFromString as parsePhoneNumberMax } from 'libphonenumber-js/max';

/**
 * docs/CHANGELOG.md, stage 1.4 bug fix: earlier drafts of every
 * phone-or-email DTO stacked TWO @ValidateIf decorators on the SAME
 * property (one gating @IsE164Phone, one gating @IsEmail). That looks
 * reasonable but is wrong — class-validator's conditional metadata does
 * NOT scope to "the validator immediately below it"; the e2e suite
 * caught this empirically (a malformed phone identifier sailed straight
 * through ValidationPipe instead of getting a 400). This file replaces
 * that pattern everywhere with a single custom validator per property
 * that branches internally, which has no such ambiguity.
 */

export function isValidE164(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('+')) return false;
  const parsed = parsePhoneNumberFromString(value);
  return parsed !== undefined && parsed.isValid();
}

export type SmsDestinationVerdict =
  'ok' | 'invalid' | 'country_not_allowed' | 'number_type_not_allowed';

/** Number types we'll pay to text. Everything else (PREMIUM_RATE,
 * TOLL_FREE, SHARED_COST, UAN, PAGER, VOICEMAIL, PERSONAL_NUMBER, plain
 * FIXED_LINE) is either an SMS-pumping target or can't receive SMS. */
const SMS_ALLOWED_NUMBER_TYPES = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE']);

/**
 * SMS-pumping defense (docs/01_FOUNDATION_AUTH.md §10.6 "блок
 * подозрительных префиксов стран (настраивается)"; owner decision
 * 2026-09-27, docs/OPEN_QUESTIONS.md): the destination's country must be
 * in `allowedCountries` (ISO-3166 alpha-2, from app_config
 * `sms.allowed_country_codes`). For +1 numbers libphonenumber resolves
 * the area code to the real country, so 'US' alone rejects Canada and
 * every Caribbean NANP territory (+1 876 Jamaica, +1 268 Antigua, ...)
 * — the classic premium-rate pumping ranges — as well as US territories
 * (PR, GU, VI, ...) unless explicitly added. Pure, synchronous: the
 * caller supplies the allow-list.
 */
export function checkSmsDestination(
  e164: string,
  allowedCountries: readonly string[],
): SmsDestinationVerdict {
  if (!e164.startsWith('+')) return 'invalid';
  const parsed = parsePhoneNumberMax(e164);
  if (!parsed || !parsed.isValid()) return 'invalid';
  if (!parsed.country || !allowedCountries.includes(parsed.country)) {
    return 'country_not_allowed';
  }
  const type = parsed.getType();
  if (!type || !SMS_ALLOWED_NUMBER_TYPES.has(type)) {
    return 'number_type_not_allowed';
  }
  return 'ok';
}

/** Validates `identifier` against E.164-phone-or-email rules based on a
 * sibling `channel`/`type` property's current value (e.g. `channel:
 * 'phone'|'email'`) — used by every OTP/contact DTO that carries an
 * explicit discriminator field. */
export function IsIdentifierForChannel(
  channelProperty: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isIdentifierForChannel',
      target: object.constructor,
      propertyName,
      constraints: [channelProperty],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedProp] = args.constraints as [string];
          const channel = (args.object as Record<string, unknown>)[relatedProp];
          if (channel === 'phone') return isValidE164(value);
          if (channel === 'email')
            return typeof value === 'string' && isEmail(value);
          // An invalid channel is already rejected by that property's own
          // @IsIn — fail closed here rather than guessing.
          return false;
        },
        defaultMessage(): string {
          return 'identifier must be a valid E.164 phone number when channel is "phone", or a valid email address when channel is "email"';
        },
      },
    });
  };
}

/** Used only by ReauthDto, which has no explicit channel field (the spec's
 * §10.5 body for /auth/reauth is just {method, code} — `identifier` was
 * added per that DTO's own doc comment, without a channel discriminator
 * to keep the request body small). Infers phone vs email from a leading
 * '+' the same way OtpService/IdentityService treat any bare E.164 string. */
export function IsPhoneOrEmailIdentifier(
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPhoneOrEmailIdentifier',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          if (value.startsWith('+')) return isValidE164(value);
          return isEmail(value);
        },
        defaultMessage(): string {
          return 'identifier must be a valid E.164 phone number or a valid email address';
        },
      },
    });
  };
}

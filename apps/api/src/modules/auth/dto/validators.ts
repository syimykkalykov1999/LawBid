import {
  registerDecorator,
  isEmail,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

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

function isValidE164(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith('+')) return false;
  const parsed = parsePhoneNumberFromString(value);
  return parsed !== undefined && parsed.isValid();
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

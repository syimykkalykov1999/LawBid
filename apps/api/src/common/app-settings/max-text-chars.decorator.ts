import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { TEXT_LIMIT_DEFS, type TextLimitKey } from './text-limits';

type LimitSource = (key: TextLimitKey) => Promise<number>;

/** Set once by TextLimitsService when the app boots; request validation
 * reads the admin's current numbers through it. Without it (a unit test
 * that validates a DTO alone) the starter values apply. */
let source: LimitSource | undefined;
export function registerTextLimitSource(fn: LimitSource): void {
  source = fn;
}

@ValidatorConstraint({ name: 'maxTextChars', async: true })
class MaxTextCharsConstraint implements ValidatorConstraintInterface {
  async validate(value: unknown, args: ValidationArguments): Promise<boolean> {
    if (typeof value !== 'string') return true; // IsString says the rest
    const key = args.constraints[0] as TextLimitKey;
    const max = source ? await source(key) : TEXT_LIMIT_DEFS[key].def;
    return [...value].length <= max;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} is longer than the allowed number of characters (${String(args.constraints[0])})`;
  }
}

/**
 * Owner 2026-10-15: like @MaxLength, but the number is the admin's limit
 * (`limits.*` in app_config), read at the moment of the request, and
 * characters are counted as a person counts them (code points).
 */
export function MaxTextChars(
  key: TextLimitKey,
  options?: ValidationOptions,
): PropertyDecorator {
  return (object, propertyName) =>
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      constraints: [key],
      validator: MaxTextCharsConstraint,
    });
}

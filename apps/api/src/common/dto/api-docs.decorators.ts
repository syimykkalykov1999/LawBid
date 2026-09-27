import { applyDecorators, HttpStatus, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
} from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code.enum';
import { ErrorResponseDto, ResponseMetaDto } from './api-response.dto';

/**
 * OpenAPI documentation helpers for the global wire format
 * (docs/01_FOUNDATION_AUTH.md §7). Documentation only: ResponseInterceptor
 * and AllExceptionsFilter produce the shapes at runtime, these decorators
 * describe them so packages/api-contract (openapi.json + the generated
 * Dart client, docs/01 §6.3) has a typed body for every response.
 */

const envelopes = new Map<string, Type<unknown>>();

/** Named envelope schema `{data: T | T[], meta?: {nextCursor}}` — one
 * named class per payload so generators emit `MeEnvelope`, not an anonymous
 * inline object per operation. */
export function envelopeOf(
  model: Type<unknown>,
  isArray = false,
): Type<unknown> {
  const name = `${model.name.replace(/Dto$/, '')}${isArray ? 'List' : ''}Envelope`;
  const cached = envelopes.get(name);
  if (cached) return cached;

  class Envelope {
    data!: unknown;
    meta?: ResponseMetaDto;
  }
  ApiProperty({ type: model, isArray })(Envelope.prototype, 'data');
  ApiPropertyOptional({ type: ResponseMetaDto })(Envelope.prototype, 'meta');
  Object.defineProperty(Envelope, 'name', { value: name });
  envelopes.set(name, Envelope);
  return Envelope;
}

/** A 2xx response whose body is the success envelope around [model]. */
export function ApiEnvelopeResponse(
  model: Type<unknown>,
  options: {
    status?: HttpStatus.OK | HttpStatus.CREATED;
    isArray?: boolean;
    description?: string;
  } = {},
): MethodDecorator & ClassDecorator {
  const envelope = envelopeOf(model, options.isArray ?? false);
  return applyDecorators(
    ApiExtraModels(model, ResponseMetaDto),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description ?? 'Success envelope (docs/01 §7).',
      type: envelope,
    }),
  );
}

const STATUS_TEXT: Partial<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'Bad request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not found',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'Payload too large',
  [HttpStatus.LOCKED]: 'Locked',
  426: 'Upgrade required',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too many requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal error',
  [HttpStatus.NOT_IMPLEMENTED]: 'Not implemented',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service unavailable',
};

export type ErrorSpec = Partial<Record<number, readonly ErrorCode[]>>;

/** Error envelope responses, keyed by HTTP status, listing the ErrorCode
 * values the route can return with that status. */
export function ApiErrors(spec: ErrorSpec): MethodDecorator & ClassDecorator {
  const decorators = Object.entries(spec).map(([status, codes]) =>
    ApiResponse({
      status: Number(status),
      description: `${STATUS_TEXT[Number(status)] ?? 'Error'}: ${(codes ?? []).join(', ')}`,
      type: ErrorResponseDto,
    }),
  );
  return applyDecorators(ApiExtraModels(ErrorResponseDto), ...decorators);
}

/** Errors any versioned route can return regardless of its own logic:
 * AppVersionGuard (426), the global throttler (429) and the exception
 * filter's fallback (500). */
export const COMMON_ERRORS: ErrorSpec = {
  426: [ErrorCode.APP_UPDATE_REQUIRED],
  [HttpStatus.TOO_MANY_REQUESTS]: [ErrorCode.RATE_LIMITED],
  [HttpStatus.INTERNAL_SERVER_ERROR]: [ErrorCode.INTERNAL_ERROR],
};

/** COMMON_ERRORS plus the global JwtAuthGuard's 401s, for controllers
 * whose routes all require a bearer token. */
export const AUTHENTICATED_ERRORS: ErrorSpec = {
  ...COMMON_ERRORS,
  [HttpStatus.UNAUTHORIZED]: [
    ErrorCode.UNAUTHORIZED,
    ErrorCode.TOKEN_EXPIRED,
    ErrorCode.AUTH_SESSION_REVOKED,
  ],
};

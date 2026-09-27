import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code.enum';

/** Runtime shapes (docs/01_FOUNDATION_AUTH.md §7) — ResponseInterceptor and
 * AllExceptionsFilter build these. The classes below document the same
 * shapes in OpenAPI; they are never instantiated. */
export interface ApiSuccessBody<T> {
  data: T;
  meta?: { nextCursor?: string | null } & Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

/** `meta` of the success envelope. Present only on paginated lists
 * (a handler returning `{items, nextCursor}`); plain payloads get no
 * `meta` at all. */
export class ResponseMetaDto {
  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'Opaque cursor for the next page; null on the last page.',
  })
  nextCursor?: string | null;
}

/** `error` of the error envelope. `code` is the one ErrorCode enum shared
 * by server and client (docs/01 §7) — clients branch on it, never on
 * `message`. */
export class ErrorBodyDto {
  @ApiProperty({ enum: ErrorCode, enumName: 'ErrorCode' })
  code!: ErrorCode;

  @ApiProperty({
    description:
      'Human-readable, not localized and not stable — never branch on it.',
  })
  message!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description:
      'Code-specific context, e.g. `validation` (VALIDATION_ERROR) or `missing` (CLIENT_CONTACTS_INCOMPLETE).',
  })
  details?: Record<string, unknown>;

  @ApiProperty({ description: 'X-Request-Id of the failed request.' })
  requestId!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto })
  error!: ErrorBodyDto;
}

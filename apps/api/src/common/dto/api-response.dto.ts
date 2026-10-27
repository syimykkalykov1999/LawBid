import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ErrorCode } from '../errors/error-code.enum';

/** Runtime shapes (docs/01_FOUNDATION_AUTH.md §7) — ResponseInterceptor and
 * AllExceptionsFilter build these. The classes below document the same
 * shapes in OpenAPI; they are never instantiated. */
export interface ApiSuccessBody<T> {
  data: T;
  meta?: {
    nextCursor?: string | null;
    deletedIds?: string[];
    syncedAt?: string;
  } & Record<string, unknown>;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
}

export class LegalDisclaimerDto {
  @ApiProperty({
    description:
      'General information, not legal advice; no attorney-client relationship.',
  })
  text!: string;

  @ApiProperty({ description: 'Changes when the wording changes.' })
  version!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'The state whose own wording is used; null = default text.',
  })
  stateCode!: string | null;

  @ApiProperty({ enum: ['qa', 'template', 'deadline'] })
  kind!: string;
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

  @ApiPropertyOptional({
    type: [String],
    description:
      'Owner 2026-10-22 (delta sync): with ?updatedSince — ids of rows that left the list (deleted, hidden, no longer mine).',
  })
  deletedIds?: string[];

  @ApiPropertyOptional({
    format: 'date-time',
    description:
      'Owner 2026-10-22 (delta sync): with ?updatedSince — the newest updated_at of this answer; pass it back as updatedSince next time.',
  })
  syncedAt?: string;

  @ApiPropertyOptional({
    type: () => LegalDisclaimerDto,
    description:
      'Owner 2026-10-28 (legal safety): on Q&A, template and deadline responses — the "general information, not legal advice" notice, worded in the admin (per state). Show it next to the content.',
  })
  disclaimer?: LegalDisclaimerDto;
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

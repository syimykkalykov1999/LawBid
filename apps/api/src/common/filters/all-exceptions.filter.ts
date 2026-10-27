import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../errors/error-code.enum';
import { getRequestId } from '../middleware/request-id.middleware';
import { CallTimeoutError, CircuitOpenError } from '../resilience/resilience';
import type { ApiErrorBody } from '../dto/api-response.dto';

/**
 * Single place that maps any thrown error to the wire format from
 * docs/01_FOUNDATION_AUTH.md §7:
 *   { "error": { "code", "message", "details", "requestId" } }
 * Feature code should throw a NestJS HttpException (or a subclass) with a
 * `code` in its response body matching ErrorCode; this filter normalizes
 * whatever it gets into that shape rather than each controller doing it.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = getRequestId(request);

    const { status, code, message, details, retryAfterSec } =
      this.normalize(exception);

    // Plain numeric threshold (not HttpStatus.INTERNAL_SERVER_ERROR) —
    // eslint's no-unsafe-enum-comparison rejects comparing a `number`
    // against an enum member even when the value is a number at runtime.
    if (status >= 500) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    } else {
      this.logger.warn({ code, requestId }, message);
    }

    const body: ApiErrorBody = { error: { code, message, details, requestId } };
    if (
      retryAfterSec !== undefined &&
      typeof response.setHeader === 'function'
    ) {
      response.setHeader('Retry-After', String(retryAfterSec));
    }
    response.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
    retryAfterSec?: number;
  } {
    // body-parser's limit (docs/06 §4.1, stage 6.1) throws before Nest's
    // pipeline; it carries `type` instead of an HttpException status.
    if (
      typeof exception === 'object' &&
      exception !== null &&
      (exception as { type?: unknown }).type === 'entity.too.large'
    ) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        code: ErrorCode.PAYLOAD_TOO_LARGE,
        message: 'Request body too large.',
      };
    }

    // A BadRequestException thrown by feature code with its own ErrorCode
    // (I18N_IMPORT_INVALID, I18N_LANGUAGE_NOT_FOUND) keeps that code — only
    // ValidationPipe's code-less 400s become VALIDATION_ERROR.
    if (
      exception instanceof BadRequestException &&
      !hasErrorCode(exception.getResponse())
    ) {
      const body = exception.getResponse();
      const details =
        typeof body === 'object' && body !== null && 'message' in body
          ? { validation: body.message }
          : undefined;
      return {
        status: HttpStatus.BAD_REQUEST,
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Request validation failed.',
        details,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null && 'code' in body) {
        const b = body as {
          code: string;
          message?: string;
          details?: Record<string, unknown>;
        };
        // A 503 that names `details.retryAfterSeconds` also sends the
        // Retry-After header (the app's retry policy reads it).
        const retry = b.details?.retryAfterSeconds;
        return {
          status,
          code: b.code,
          message: b.message ?? exception.message,
          details: b.details,
          retryAfterSec:
            status === 503 && typeof retry === 'number' ? retry : undefined,
        };
      }
      return {
        status,
        code: this.codeForStatus(status),
        message: exception.message,
      };
    }

    // Owner 2026-10-19 («нажимаю на оплату не переходит»): a Stripe call
    // that fails (wrong or revoked key, a price from the other mode, Stripe
    // unreachable) is «payments unavailable» for the app, not a bare 500.
    // A declined card keeps the generic error.
    const stripeType = (exception as { type?: unknown } | null)?.type;
    if (
      typeof stripeType === 'string' &&
      stripeType.startsWith('Stripe') &&
      stripeType !== 'StripeCardError'
    ) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: ErrorCode.PAYMENTS_NOT_CONFIGURED,
        message: 'Payments are temporarily unavailable.',
      };
    }

    // Batch C item 6: an outside service (SES, Twilio, Bunny, Stripe) is
    // paused by its circuit breaker or timed out: «try again shortly», the
    // same answer the apps already retry for load shedding.
    if (
      exception instanceof CircuitOpenError ||
      exception instanceof CallTimeoutError
    ) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'SERVER_BUSY',
        message: 'A partner service is slow right now. Try again shortly.',
        retryAfterSec: 10,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error.',
    };
  }

  private codeForStatus(status: number): string {
    const map: Record<number, ErrorCode> = {
      [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
      [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
      [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
      [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
    };
    return map[status] ?? ErrorCode.INTERNAL_ERROR;
  }
}

function hasErrorCode(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    'code' in body &&
    typeof body.code === 'string'
  );
}

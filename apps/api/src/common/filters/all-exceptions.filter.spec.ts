import {
  BadRequestException,
  ForbiddenException,
  type ArgumentsHost,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../errors/error-code.enum';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown): { status: number; body: unknown } {
  const logger = {
    setContext: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
  const filter = new AllExceptionsFilter(logger);
  const out: { status: number; body: unknown } = { status: 0, body: null };
  const response = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
    },
  };
  const request = {
    headers: { 'x-request-id': 'req-1' },
    header: () => 'req-1',
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  filter.catch(exception, host);
  return out;
}

describe('AllExceptionsFilter (docs/01 §7 error envelope)', () => {
  it('maps a ValidationPipe 400 (no code) to VALIDATION_ERROR with details.validation', () => {
    const { status, body } = run(
      new BadRequestException(['identifier must be a string']),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        details: { validation: ['identifier must be a string'] },
      },
    });
  });

  it('keeps the ErrorCode of a BadRequestException thrown with one', () => {
    const { status, body } = run(
      new BadRequestException({
        code: ErrorCode.I18N_IMPORT_INVALID,
        message: 'Import validation failed — nothing was applied.',
        details: { errors: [{ row: 3, message: 'duplicate key' }] },
      }),
    );
    expect(status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: ErrorCode.I18N_IMPORT_INVALID,
        message: 'Import validation failed — nothing was applied.',
        details: { errors: [{ row: 3, message: 'duplicate key' }] },
      },
    });
  });

  it('passes other HttpExceptions through with their own code', () => {
    const { status, body } = run(
      new ForbiddenException({ code: ErrorCode.REAUTH_REQUIRED }),
    );
    expect(status).toBe(403);
    expect(body).toMatchObject({ error: { code: ErrorCode.REAUTH_REQUIRED } });
  });

  it('hides unknown errors behind INTERNAL_ERROR', () => {
    const { status, body } = run(new Error('db exploded'));
    expect(status).toBe(500);
    expect(body).toMatchObject({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error.',
      },
    });
  });
});

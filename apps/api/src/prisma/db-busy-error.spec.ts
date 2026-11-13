import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';
import { isDbBusyError } from './db-busy-error';

describe('isDbBusyError', () => {
  const known = (code: string, message = 'x') =>
    new PrismaClientKnownRequestError(message, { code, clientVersion: 't' });

  it('Prisma pool timeout and «could not start a transaction» are busy', () => {
    expect(isDbBusyError(known('P2024'))).toBe(true);
    expect(
      isDbBusyError(
        known(
          'P2028',
          'Transaction API error: Unable to start a transaction in the given time.',
        ),
      ),
    ).toBe(true);
  });

  it('Prisma 7: node-pg pool timeout passed through as a plain Error is busy', () => {
    expect(
      isDbBusyError(new Error('timeout exceeded when trying to connect')),
    ).toBe(true);
  });

  it('other errors are not', () => {
    expect(isDbBusyError(known('P2028', 'Transaction already closed'))).toBe(
      false,
    );
    expect(isDbBusyError(known('P2002'))).toBe(false);
    expect(isDbBusyError(new Error('boom'))).toBe(false);
  });
});

import { HttpException } from '@nestjs/common';
import { decodeCursor, encodeCursor } from './cursor.util';

describe('created_at/id keyset cursor', () => {
  const id = '3f2b8c1e-8d4a-4b5e-9c6f-0a1b2c3d4e5f';

  it('round-trips', () => {
    const createdAt = new Date('2026-09-27T10:11:12.345Z');
    expect(decodeCursor(encodeCursor({ createdAt, id }))).toEqual({
      createdAt,
      id,
    });
  });

  it.each([
    'not-base64-json',
    Buffer.from('{"t":"nope","id":"x"}').toString('base64url'),
    Buffer.from('{"t":"2026-01-01T00:00:00Z","id":"1; DROP"}').toString(
      'base64url',
    ),
    Buffer.from('null').toString('base64url'),
  ])('rejects %s with VALIDATION_ERROR', (raw) => {
    try {
      decodeCursor(raw);
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(400);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: 'VALIDATION_ERROR',
        details: { field: 'cursor' },
      });
    }
  });
});

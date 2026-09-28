import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import { RequireIdempotencyKeyGuard } from './require-idempotency-key.guard';

function ctx(headers: Record<string, string>): ExecutionContext {
  const req = {
    header: (name: string) => headers[name.toLowerCase()],
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('RequireIdempotencyKeyGuard', () => {
  const guard = new RequireIdempotencyKeyGuard();

  it('passes when the header is present', () => {
    expect(guard.canActivate(ctx({ 'idempotency-key': 'k1' }))).toBe(true);
  });

  it.each<Record<string, string>>([{}, { 'idempotency-key': '  ' }])(
    'rejects a missing/blank key with IDEMPOTENCY_KEY_REQUIRED',
    (headers) => {
      try {
        guard.canActivate(ctx(headers));
        throw new Error('expected a throw');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          code: 'IDEMPOTENCY_KEY_REQUIRED',
        });
      }
    },
  );
});

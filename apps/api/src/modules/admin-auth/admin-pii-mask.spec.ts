import { maskEmail, maskName, maskPhone, maskPii } from './admin-pii-mask';
import { AdminPiiMaskInterceptor } from './admin-pii-mask.interceptor';
import { lastValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';

describe('PII masking (owner 2026-10-16)', () => {
  it('masks phone, email and names by key, at any depth', () => {
    const out = maskPii({
      items: [
        {
          id: 'u1',
          firstName: 'Sofia',
          lastName: 'Martinez Lopez',
          email: 'sofia@example.com',
          phone_e164: '+14155552680',
          status: 'active',
          amount: 4900,
          nested: {
            contactPhone: '+1 (415) 555-2681',
            displayName: 'amelia ross',
          },
        },
      ],
      nextCursor: null,
    }) as { items: Record<string, unknown>[] };
    const row = items0(out);
    expect(row.firstName).toBe('S.');
    expect(row.lastName).toBe('M. L.');
    expect(row.email).toBe('s•••@•••');
    expect(row.phone_e164).toBe('••••80');
    expect(row.nested).toEqual({
      contactPhone: '••••81',
      displayName: 'A. R.',
    });
    // Everything else is untouched.
    expect(row.id).toBe('u1');
    expect(row.status).toBe('active');
    expect(row.amount).toBe(4900);
    expect(JSON.stringify(out)).not.toMatch(/sofia@|2680|Martinez/);
  });

  it('does not touch the original, dates, nulls or empty strings', () => {
    const when = new Date('2026-10-16T00:00:00Z');
    const src = { email: null, phone: '', createdAt: when, tags: ['a'] };
    const out = maskPii(src) as typeof src;
    expect(out).toEqual(src);
    expect(out.createdAt).toBe(when);
    const orig = { email: 'a@b.co' };
    maskPii(orig);
    expect(orig.email).toBe('a@b.co');
  });

  it('masks class instances (DTOs) too', () => {
    class Dto {
      email = 'x@y.io';
      id = '1';
    }
    expect(maskPii(new Dto())).toEqual({ email: 'x•••@•••', id: '1' });
  });

  it('helpers are safe on odd input', () => {
    expect(maskPhone('12')).toBe('••••');
    expect(maskEmail('nope')).toBe('•••');
    expect(maskName('   ')).toBe('   ');
  });

  it('the interceptor masks only for a no-PII admin', async () => {
    const run = async (admin: unknown) => {
      const ctx = {
        switchToHttp: () => ({ getRequest: () => ({ admin }) }),
      } as unknown as ExecutionContext;
      const next: CallHandler = { handle: () => of({ email: 'a@b.co' }) };
      return lastValueFrom(new AdminPiiMaskInterceptor().intercept(ctx, next));
    };
    expect(await run({ noPii: true })).toEqual({ email: 'a•••@•••' });
    expect(await run({ noPii: false })).toEqual({ email: 'a@b.co' });
    expect(await run(undefined)).toEqual({ email: 'a@b.co' });
  });
});

function items0(v: { items: Record<string, unknown>[] }) {
  return v.items[0];
}

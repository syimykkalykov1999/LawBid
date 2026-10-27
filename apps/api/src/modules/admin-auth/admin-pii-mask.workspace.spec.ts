import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import type { StaffSecurityPort } from '../staff-core/staff-security.port';
import type { RequestAdmin } from './admin-auth.decorators';
import { AdminPiiMaskInterceptor } from './admin-pii-mask.interceptor';

const body = {
  items: [{ phone: '+14155552680', email: 'a@b.co', firstName: 'Ann' }],
};

async function run(
  admin: Partial<RequestAdmin> | undefined,
  port?: Partial<StaffSecurityPort>,
) {
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => ({ admin, url: '/x', method: 'GET' }),
    }),
  } as unknown as ExecutionContext;
  const next: CallHandler = {
    handle: jest.fn(() => of(JSON.parse(JSON.stringify(body)) as typeof body)),
  };
  const interceptor = new AdminPiiMaskInterceptor(
    port as StaffSecurityPort | undefined,
  );
  const out = await lastValueFrom(interceptor.intercept(ctx, next));
  return { out, next };
}

describe('AdminPiiMaskInterceptor + staff security (T11)', () => {
  it('without the staff-security module the answer is untouched', async () => {
    const { out } = await run({ id: 'a' });
    expect(out).toEqual(body);
  });

  it('mode none (switch off / owner / finance): untouched', async () => {
    const port = {
      beforeHandler: jest.fn(() => Promise.resolve()),
      maskMode: jest.fn(() => Promise.resolve('none' as const)),
    };
    const { out } = await run({ id: 'a' }, port);
    expect(out).toEqual(body);
    expect(port.beforeHandler).toHaveBeenCalled();
  });

  it('mode partial: phone and e-mail shortened, names kept', async () => {
    const port = {
      beforeHandler: jest.fn(() => Promise.resolve()),
      maskMode: jest.fn(() => Promise.resolve('partial' as const)),
    };
    const { out } = await run({ id: 'a' }, port);
    expect(out).toEqual({
      items: [{ phone: '+1 *** ** 80', email: 'a***@b.co', firstName: 'Ann' }],
    });
  });

  it('a refusal from beforeHandler (closed export) stops the handler', async () => {
    const port = {
      beforeHandler: jest.fn(() => Promise.reject(new Error('blocked'))),
      maskMode: jest.fn(),
    };
    await expect(run({ id: 'a' }, port)).rejects.toThrow('blocked');
  });

  it('the no-PII flag still wins with the full mask', async () => {
    const port = {
      beforeHandler: jest.fn(),
      maskMode: jest.fn(),
    };
    const { out } = await run({ id: 'a', noPii: true }, port);
    expect(out).toEqual({
      items: [{ phone: '••••80', email: 'a•••@•••', firstName: 'A.' }],
    });
    expect(port.beforeHandler).not.toHaveBeenCalled();
  });
});

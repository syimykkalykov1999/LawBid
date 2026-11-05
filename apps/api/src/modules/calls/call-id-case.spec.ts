import { ValidationPipe } from '@nestjs/common';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { CallsController } from './calls.controller';
import { CallIdParamDto } from './calls.dto';
import type { CallsService } from './calls.service';

const UPPER = '746B3B2A-1C2D-4E5F-8A9B-0C1D2E3F4A5B';
const LOWER = '746b3b2a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

/** The global pipe as app.setup.ts installs it (whitelist + transform). */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const params = (id: string): Promise<CallIdParamDto> =>
  pipe.transform(
    { id },
    { type: 'param', metatype: CallIdParamDto },
  ) as Promise<CallIdParamDto>;

/**
 * R-377 (prod log 2026-11-04): iOS CallKit hands a call id back as
 * `UUID.uuidString` — UPPERCASE — and `POST /calls/746B3B2A-…/decline`
 * answered 404 because the call is stored lowercase, so the decline never
 * reached the caller. Every `/calls/:id/*` route lowercases the id before
 * the lookup; old app builds are covered by this alone.
 */
describe('POST /calls/:id/* — call id case (R-377)', () => {
  it('an uppercase id reaches the service lowercase', async () => {
    const decline = jest.fn().mockResolvedValue({ id: LOWER });
    const controller = new CallsController({
      decline,
    } as unknown as CallsService);
    const user = { sub: 'callee', sid: 's1' } as unknown as RequestUser;

    await controller.declineCall(user, await params(UPPER));

    expect(decline).toHaveBeenCalledWith(user, LOWER);
  });

  it('a lowercase id is left as it is', async () => {
    expect((await params(LOWER)).id).toBe(LOWER);
  });

  it('a value that is not a UUID is still refused', async () => {
    await expect(params('not-a-uuid')).rejects.toMatchObject({
      status: 400,
    });
  });
});

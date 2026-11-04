/* eslint-disable @typescript-eslint/require-await -- in-memory fakes */
import { ForbiddenException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type { CreateVideoUploadDto } from '../videos/videos.dto';
import type { VideosService } from '../videos/videos.service';
import type { CreatePostDto } from './dto/posts.dto';
import { PostVideosController } from './post-videos.controller';
import { PostsService, REELS_CLIENT_FLAG } from './posts.service';

/**
 * Owner 2026-11-04 (R-381): «Выключено — клиенты не могут публиковать
 * рилсы, могут только смотреть рилсы, которые публикуют адвокаты; фото и
 * брифы клиенты публикуют как раньше. Адвокаты рилсы публикуют всегда».
 * With `reels_client_publish` off the API refuses a client's video upload
 * and a client's post with a video (an old app build cannot publish one
 * either); attorneys pass, photos and briefs are untouched.
 */
type Role = 'client' | 'attorney';
const userOf = (role: Role) =>
  ({ sub: 'me', role }) as Parameters<PostsService['create']>[0];

/** Past the switch, `attachableVideo` answers with this. */
const REACHED = 'reached';

function world(on: boolean) {
  const isEnabled = jest.fn(async (key: string, fallback: boolean) =>
    key === REELS_CLIENT_FLAG ? on : fallback,
  );
  const attachableVideo = jest.fn(async () => {
    throw new Error(REACHED);
  });
  const svc = Object.create(PostsService.prototype) as PostsService;
  Object.assign(svc, {
    flags: { isEnabled },
    assertCanPost: jest.fn(async () => undefined),
    settings: { number: jest.fn(async () => 2200) },
    attachableVideo,
    // A photo post / brief goes on to the post limits: stop there.
    limits: {
      consume: jest.fn(async () => {
        throw new Error(REACHED);
      }),
    },
  });
  return { svc, isEnabled, attachableVideo };
}

async function codeOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ForbiddenException) {
      const body = e.getResponse() as { code?: unknown; details?: unknown };
      return { code: body.code, details: body.details };
    }
    if (e instanceof Error) return e.message;
  }
  return 'resolved';
}

const reel = { body: '', videoAssetId: 'v1' } as unknown as CreatePostDto;
const photos = {
  body: '',
  mediaFileIds: ['f1'],
} as unknown as CreatePostDto;
const brief = { body: 'text' } as unknown as CreatePostDto;
const refused = {
  code: ErrorCode.FEATURE_DISABLED,
  details: { flag: REELS_CLIENT_FLAG },
};

describe('reels_client_publish off (R-381)', () => {
  it('the switch is read with «off» as the fallback', async () => {
    const w = world(false);
    await codeOf(w.svc.assertReelPublish(userOf('client')));
    expect(w.isEnabled).toHaveBeenCalledWith(REELS_CLIENT_FLAG, false);
  });

  it("refuses a client's reel (post with a video)", async () => {
    const w = world(false);
    expect(await codeOf(w.svc.create(userOf('client'), reel))).toEqual(refused);
    expect(w.attachableVideo).not.toHaveBeenCalled();
  });

  it("a client's photos and briefs go on as before", async () => {
    const w = world(false);
    expect(await codeOf(w.svc.create(userOf('client'), photos))).toBe(REACHED);
    expect(await codeOf(w.svc.create(userOf('client'), brief))).toBe(REACHED);
  });

  it("an attorney's reel goes on", async () => {
    const w = world(false);
    expect(await codeOf(w.svc.create(userOf('attorney'), reel))).toBe(REACHED);
    expect(w.isEnabled).not.toHaveBeenCalledWith(REELS_CLIENT_FLAG, false);
  });
});

describe('reels_client_publish on', () => {
  it("a client's reel goes on", async () => {
    const w = world(true);
    expect(await codeOf(w.svc.create(userOf('client'), reel))).toBe(REACHED);
    expect(w.attachableVideo).toHaveBeenCalled();
  });
});

describe('POST /videos/uploads (R-381)', () => {
  function controller(on: boolean) {
    const w = world(on);
    Object.assign(w.svc, {
      assertCanPublish: jest.fn(async () => undefined),
    });
    const createUpload = jest.fn(async () => ({ id: 'v1' }));
    const c = new PostVideosController(
      { createUpload } as unknown as VideosService,
      w.svc,
    );
    return { c, createUpload };
  }
  const dto = {} as CreateVideoUploadDto;

  it('refuses a client while off, before any Bunny video is made', async () => {
    const { c, createUpload } = controller(false);
    expect(await codeOf(c.createVideoUpload(userOf('client'), dto))).toEqual(
      refused,
    );
    expect(createUpload).not.toHaveBeenCalled();
  });

  it('lets a client in while on', async () => {
    const { c, createUpload } = controller(true);
    expect(await codeOf(c.createVideoUpload(userOf('client'), dto))).toBe(
      'resolved',
    );
    expect(createUpload).toHaveBeenCalled();
  });

  it('lets an attorney in while off', async () => {
    const { c, createUpload } = controller(false);
    expect(await codeOf(c.createVideoUpload(userOf('attorney'), dto))).toBe(
      'resolved',
    );
    expect(createUpload).toHaveBeenCalled();
  });
});

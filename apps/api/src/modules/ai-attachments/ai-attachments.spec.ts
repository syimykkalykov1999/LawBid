import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import sharp from 'sharp';
import { ADMIN_ROLES_KEY } from '../admin-auth/admin-auth.decorators';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { PURPOSE_RULES } from '../files/files.policy';
import {
  AiAttachmentsController,
  ownerOnly,
} from './ai-attachments.controller';
import {
  AI_IMAGE_B64_MAX,
  AI_IMAGE_LONG_EDGE,
  AI_IMAGES_PER_REQUEST,
  AI_REQUEST_IMAGE_BYTES,
  AiAttachmentError,
  cleanIds,
  fitRequest,
  issueAttachmentsLine,
  parseIssueAttachments,
  retentionDays,
} from './ai-attachments.logic';
import { AiAttachmentsService, downscaleForAi } from './ai-attachments.service';

/**
 * Owner 2026-11-12 (rows 48, 49): the owner's screenshots and photos for the
 * AI technician and the AI employee. Owner only; the real type comes from the
 * bytes; at most 10 per set; no EXIF / GPS reaches the AI; GitHub sees ids.
 */
const ID1 = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

const staffOf = (role: string) => ({
  id: 'a',
  adminRole: role as never,
  sessionId: 's',
  justification: null,
  manageAdmins: true,
  ip: null,
});

function controller(over: Record<string, unknown> = {}) {
  const files = { presign: jest.fn(), confirm: jest.fn() };
  const auth = { assertStepUp: jest.fn(() => Promise.resolve()) };
  const config = { updateConfig: jest.fn(() => Promise.resolve({})) };
  const retention = {
    days: jest.fn(() => Promise.resolve({ recordsDays: 15, imagesDays: 15 })),
    purgeNow: jest.fn(() =>
      Promise.resolve({
        items: 3,
        runs: 1,
        images: 2,
        closedTasks: 0,
        unattached: 0,
      }),
    ),
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const c = new AiAttachmentsController(
    (over.files ?? files) as never,
    (over.auth ?? auth) as never,
    config as never,
    retention as never,
    audit as never,
  );
  return { c, files, auth, config, retention, audit };
}

describe('AI images: owner only', () => {
  it('the controller is under admin/, super_admin only, behind AdminAuthGuard', () => {
    expect(Reflect.getMetadata('path', AiAttachmentsController)).toBe(
      'admin/ai-attachments',
    );
    expect(
      new Reflector().get(ADMIN_ROLES_KEY, AiAttachmentsController),
    ).toEqual(['super_admin']);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AiAttachmentsController),
    ).toContain(AdminAuthGuard);
  });

  it.each(['moderator', 'verifier', 'support', 'finance'] as const)(
    '%s gets 403 on every route (uploads, retention, purge)',
    async (role) => {
      const { c, files, auth, retention } = controller();
      const staff = staffOf(role);
      const calls: Array<() => unknown> = [
        () =>
          c.presignAiImage(staff, {
            mime: 'image/png',
            sizeBytes: 10,
            sha256: 'a'.repeat(64),
          }),
        () => c.confirmAiImage(staff, { fileId: ID1 }),
        () => c.getAiRetention(staff),
        () => c.updateAiRetention(staff, { days: 1, what: 'images' }),
        () => c.purgeAiRetention(staff, { mode: 'all', scope: 'worker' }),
      ];
      for (const call of calls) {
        await expect(Promise.resolve().then(call)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      }
      expect(files.presign).not.toHaveBeenCalled();
      expect(retention.purgeNow).not.toHaveBeenCalled();
      expect(auth.assertStepUp).not.toHaveBeenCalled();
    },
  );

  it('the owner uploads through the files pipeline (purpose ai_attachment, no quota) after 2FA', async () => {
    const { c, files, auth } = controller();
    await c.presignAiImage(staffOf('super_admin'), {
      mime: 'image/png',
      sizeBytes: 1000,
      sha256: 'a'.repeat(64),
    });
    expect(auth.assertStepUp).toHaveBeenCalledWith('s');
    expect(files.presign).toHaveBeenCalledWith(
      'a',
      expect.objectContaining({ purpose: 'ai_attachment', mime: 'image/png' }),
      { byAdmin: true },
    );
    expect(() => ownerOnly({ adminRole: 'super_admin' })).not.toThrow();
  });

  it('a missing 2FA code stops the upload, the settings change and the purge', async () => {
    const stepUp = new ForbiddenException({ code: 'ADMIN_STEP_UP_REQUIRED' });
    const auth = { assertStepUp: jest.fn(() => Promise.reject(stepUp)) };
    const { c, files, config, retention } = controller({ auth });
    const owner = staffOf('super_admin');
    await expect(
      c.presignAiImage(owner, {
        mime: 'image/png',
        sizeBytes: 1,
        sha256: 'a'.repeat(64),
      }),
    ).rejects.toBe(stepUp);
    await expect(
      c.updateAiRetention(owner, { days: 3, what: 'records' }),
    ).rejects.toBe(stepUp);
    await expect(
      c.purgeAiRetention(owner, { mode: 'older', scope: 'technician' }),
    ).rejects.toBe(stepUp);
    expect(files.presign).not.toHaveBeenCalled();
    expect(config.updateConfig).not.toHaveBeenCalled();
    expect(retention.purgeNow).not.toHaveBeenCalled();
  });

  it('«Хранить N дней» goes through the audited app_config path; «Очистить сейчас» writes one audit row', async () => {
    const { c, config, retention, audit } = controller();
    const owner = staffOf('super_admin');
    await c.updateAiRetention(owner, { days: 7, what: 'records' });
    expect(config.updateConfig).toHaveBeenCalledWith(
      owner,
      'ai.retention_records_days',
      7,
    );
    await c.updateAiRetention(owner, { days: 0, what: 'images' });
    expect(config.updateConfig).toHaveBeenLastCalledWith(
      owner,
      'ai.retention_images_days',
      0,
    );
    const r = await c.purgeAiRetention(owner, { mode: 'all', scope: 'worker' });
    expect(retention.purgeNow).toHaveBeenCalledWith('all', 'worker');
    expect(r.items).toBe(3);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ai.retention_purge',
        before: { mode: 'all', scope: 'worker' },
        after: expect.objectContaining({ items: 3, images: 2 }),
      }),
    );
  });
});

describe('AI images: rules', () => {
  it('only the four types Claude reads, in the private bucket', () => {
    expect(PURPOSE_RULES.ai_attachment.mimes).toEqual([
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
    ]);
    expect(PURPOSE_RULES.ai_attachment.bucket).toBe('documents');
  });

  it('no count cap of ours: valid ids only, no duplicates', () => {
    expect(cleanIds([ID1, ID1.toUpperCase(), ID2])).toEqual([ID1, ID2]);
    expect(() => cleanIds(['../../etc'])).toThrow(AiAttachmentError);
    const many = Array.from(
      { length: 700 },
      (_, i) => `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
    );
    expect(cleanIds(many)).toHaveLength(700);
    expect(parseIssueAttachments(issueAttachmentsLine(many))).toHaveLength(700);
  });

  it('one Claude request carries what the API allows (600 pictures, ~100 MB); the rest is counted', () => {
    expect(AI_IMAGES_PER_REQUEST).toBe(600);
    const small = Array.from({ length: 650 }, () => ({ data: 'x'.repeat(10) }));
    const a = fitRequest(small);
    expect(a.sent).toHaveLength(600);
    expect(a.skipped).toBe(50);
    const big = Array.from({ length: 30 }, () => ({
      data: 'x'.repeat(5 * 1024 * 1024),
    }));
    const b = fitRequest(big);
    expect(b.sent.length * 5 * 1024 * 1024).toBeLessThanOrEqual(
      AI_REQUEST_IMAGE_BYTES,
    );
    expect(b.sent).toHaveLength(20);
    expect(b.skipped).toBe(10);
    expect(fitRequest([])).toEqual({ sent: [], skipped: 0 });
  });

  it('the issue line carries ids only and the workflow reads them back', () => {
    const line = issueAttachmentsLine([ID1, ID2]);
    expect(line).toBe(`AI attachments: ${ID1} ${ID2}`);
    expect(line).not.toMatch(/https?:|\//);
    expect(parseIssueAttachments(`text\n\n${line}\nmore`)).toEqual([ID1, ID2]);
    expect(parseIssueAttachments('AI attachments: https://x/y.png')).toEqual(
      [],
    );
    expect(issueAttachmentsLine([])).toBe('');
  });

  it('days: 1-36500, 0 (or nonsense) = keep forever', () => {
    expect(retentionDays(15)).toBe(15);
    expect(retentionDays(0)).toBe(0);
    expect(retentionDays(-3)).toBe(0);
    expect(retentionDays('x')).toBe(0);
    expect(retentionDays(9999)).toBe(9999);
    expect(retentionDays(99999)).toBe(36500);
  });
});

describe('AI images: what the AI gets', () => {
  it('a wrong type (by its bytes) is refused, whatever was declared', async () => {
    expect(
      await downscaleForAi(Buffer.from('%PDF-1.7 not a picture')),
    ).toBeNull();
    expect(
      await downscaleForAi(Buffer.from('<svg xmlns="x"></svg>')),
    ).toBeNull();
    expect(await downscaleForAi(Buffer.from('just text'))).toBeNull();
  });

  it('a big photo is scaled to 2576 px on the long edge and loses its EXIF / GPS', async () => {
    const big = await sharp({
      create: {
        width: 3000,
        height: 1000,
        channels: 3,
        background: '#3366aa',
      },
    })
      .withMetadata({
        exif: {
          IFD0: { Make: 'PhoneCo', Model: 'X1' },
          IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '36/1 10/1 0/1' },
        },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(big).metadata()).exif).toBeDefined();
    const out = await downscaleForAi(big);
    expect(out?.mediaType).toBe('image/jpeg');
    const buf = Buffer.from(out!.data, 'base64');
    const meta = await sharp(buf).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(
      AI_IMAGE_LONG_EDGE,
    );
    expect(meta.exif).toBeUndefined();
    expect(buf.includes(Buffer.from('PhoneCo'))).toBe(false);
  });

  it('a small PNG stays its size (never upscaled), a GIF becomes a PNG', async () => {
    const png = await sharp({
      create: { width: 40, height: 20, channels: 4, background: '#fff' },
    })
      .png()
      .toBuffer();
    const p = await downscaleForAi(png);
    expect(p?.mediaType).toBe('image/png');
    expect((await sharp(Buffer.from(p!.data, 'base64')).metadata()).width).toBe(
      40,
    );
    const gif = await sharp({
      create: { width: 10, height: 10, channels: 3, background: '#000' },
    })
      .gif()
      .toBuffer();
    expect((await downscaleForAi(gif))?.mediaType).toBe('image/png');
  });
});

describe('AI images: links', () => {
  function svc(files: unknown[], rows: unknown[] = []) {
    const created: unknown[] = [];
    const prisma = {
      file: {
        findMany: jest.fn(() => Promise.resolve(files)),
      },
      aiAttachment: {
        createManyAndReturn: jest.fn((a: { data: unknown[] }) => {
          created.push(...a.data);
          return Promise.resolve(a.data.map((_r, i) => ({ id: `att-${i}` })));
        }),
        findMany: jest.fn(() => Promise.resolve(rows)),
        updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
      },
    };
    const storage = { configured: true, read: jest.fn() };
    return {
      s: new AiAttachmentsService(prisma as never, storage as never),
      prisma,
      created,
      storage,
    };
  }

  it('only the owner’s own ai_attachment uploads can be attached', async () => {
    const t = svc([{ id: ID1 }]);
    await expect(t.s.prepareTask('owner', [ID1, ID2])).rejects.toThrow(
      AiAttachmentError,
    );
    expect(t.prisma.file.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          owner_user_id: 'owner',
          purpose: 'ai_attachment',
          deleted_at: null,
        }),
      }),
    );
    expect(t.created).toHaveLength(0);
  });

  it('a task gets rows without an issue number until the issue exists', async () => {
    const t = svc([{ id: ID1 }, { id: ID2 }]);
    const ids = await t.s.prepareTask('owner', [ID1, ID2]);
    expect(ids).toEqual(['att-0', 'att-1']);
    expect(t.created).toEqual([
      expect.objectContaining({
        kind: 'task',
        file_id: ID1,
        issue_number: null,
        position: 0,
      }),
      expect.objectContaining({ kind: 'task', file_id: ID2, position: 1 }),
    ]);
  });

  it('the workflow only reads open rows of ITS issue', async () => {
    const t = svc([], []);
    await t.s.taskImages(7, [ID1]);
    expect(t.prisma.aiAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [ID1] },
          kind: 'task',
          issue_number: 7,
          closed_at: null,
        },
      }),
    );
  });

  it('a picture still in the antivirus counts as pending, an infected one is never read', async () => {
    const t = svc(
      [
        {
          id: 'f1',
          scan_status: 'pending',
          s3_bucket: 'b',
          s3_key: 'k1',
          mime: 'image/png',
        },
        {
          id: 'f2',
          scan_status: 'infected',
          s3_bucket: 'b',
          s3_key: 'k2',
          mime: 'image/png',
        },
      ],
      [
        { id: 'a1', file_id: 'f1' },
        { id: 'a2', file_id: 'f2' },
      ],
    );
    const r = await t.s.taskImages(7, [ID1]);
    expect(r).toEqual({ images: [], pending: 1 });
    expect(t.storage.read).not.toHaveBeenCalled();
  });
});

describe("AI images: only the API's own size limit", () => {
  it('a picture too big for the API as PNG goes as a JPEG of the same pixels (under 10 MB base64)', async () => {
    const noisy = await sharp({
      create: {
        width: 2600,
        height: 2600,
        channels: 3,
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma: 60 },
      },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const out = await downscaleForAi(noisy);
    expect(out).not.toBeNull();
    expect(out!.data.length).toBeLessThanOrEqual(AI_IMAGE_B64_MAX);
    expect(out!.mediaType).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(out!.data, 'base64')).metadata();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(
      AI_IMAGE_LONG_EDGE,
    );
  }, 30_000);
});

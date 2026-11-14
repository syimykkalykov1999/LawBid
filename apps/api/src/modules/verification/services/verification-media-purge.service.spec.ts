import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PinoLogger } from 'nestjs-pino';
import type { AppSettingsService } from '../../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../../prisma/prisma.service';
import { ANONYMIZED_FILE_PURPOSES } from '../../privacy/privacy.constants';
import { AUTO_APPEAL_WINDOW_DAYS } from '../../moderation/auto-appeals.service';
import { CLEANUP_EXEMPT_PURPOSES, derivedKeys } from '../../files/files.policy';
import { FileReleaseService } from '../../files/storage/file-release.service';
import type { S3StorageService } from '../../files/storage/s3-storage.service';
import { AUTO_REJECT_KIND } from './verification-auto-decision.service';
import { VerificationAdminService } from './verification-admin.service';
import { VerificationChecksService } from './verification-checks.service';
import {
  AUTO_REJECT_APPEAL_DAYS,
  DEFAULT_ABANDONED_DAYS,
  VerificationMediaPurgeService,
} from './verification-media-purge.service';

const DAY = 24 * 3600 * 1000;
const NOW = new Date('2026-11-13T12:00:00Z');
const BUCKET = 'lawbid-documents';

// ------------------------------------------------------------ in-memory DB

interface FileRow {
  id: string;
  purpose: string;
  s3_bucket: string;
  s3_key: string;
  deleted_at: Date | null;
  deleted_reason: string | null;
  purged_at: Date | null;
}
interface RequestRow {
  id: string;
  status: string;
  attorney_id: string;
  updated_at: Date;
}
interface DocRow {
  id: string;
  request_id: string;
  doc_type: string;
  file_id: string;
  created_at: Date;
}
interface AutoActionRow {
  kind: string;
  target_id: string;
  created_at: Date;
  appeal_status: 'pending' | 'accepted' | 'rejected' | null;
  reversed_at: Date | null;
}

type Where = Record<string, unknown>;
const inList = (v: unknown, f: unknown): boolean =>
  ((f as { in: unknown[] }).in ?? []).includes(v);

function world() {
  const files = new Map<string, FileRow>();
  const requests = new Map<string, RequestRow>();
  const docs: DocRow[] = [];
  const autoActions: AutoActionRow[] = [];
  const holds: { target_type: string; target_id: string }[] = [];
  const userStatus = new Map<string, string>();
  /** The objects in storage (bucket\nkey). */
  const objects = new Set<string>();
  const invalidated: string[] = [];
  let failRemove = false;

  const fileMatches = (f: FileRow, w: Where): boolean => {
    if (w.id && !inList(f.id, w.id)) return false;
    if ('deleted_at' in w) {
      const d = w.deleted_at;
      if (d === null && f.deleted_at !== null) return false;
      if (d && (d as Where).not === null && f.deleted_at === null) return false;
    }
    if ('purged_at' in w && w.purged_at === null && f.purged_at !== null)
      return false;
    if (w.purpose && !inList(f.purpose, w.purpose)) return false;
    if (w.OR) {
      const or = w.OR as { s3_bucket: string; s3_key: string }[];
      if (!or.some((o) => o.s3_bucket === f.s3_bucket && o.s3_key === f.s3_key))
        return false;
    }
    return true;
  };
  const docMatches = (d: DocRow, w: Where): boolean => {
    if (w.request_id && d.request_id !== w.request_id) return false;
    if (w.file && !fileMatches(files.get(d.file_id)!, w.file as Where))
      return false;
    const ca = w.created_at as { gte?: Date } | undefined;
    if (ca?.gte && d.created_at < ca.gte) return false;
    return true;
  };
  const docsRel = (r: RequestRow, rel: Where): boolean => {
    const mine = docs.filter((d) => d.request_id === r.id);
    if (rel.some) return mine.some((d) => docMatches(d, rel.some as Where));
    if (rel.none) return !mine.some((d) => docMatches(d, rel.none as Where));
    return true;
  };
  const requestMatches = (r: RequestRow, w: Where): boolean => {
    if (w.status && !inList(r.status, w.status)) return false;
    const ua = w.updated_at as { lt?: Date } | undefined;
    if (ua?.lt && !(r.updated_at < ua.lt)) return false;
    if (w.documents && !docsRel(r, w.documents as Where)) return false;
    for (const a of (w.AND as Where[] | undefined) ?? []) {
      if (!requestMatches(r, a)) return false;
    }
    const att = w.attorney as { user: { status: string } } | undefined;
    if (att && userStatus.get(r.attorney_id) !== att.user.status) return false;
    return true;
  };

  const prisma = {
    verificationRequest: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(requests.get(where.id) ?? null),
      ),
      findMany: jest.fn(({ where, take }: { where: Where; take: number }) =>
        Promise.resolve(
          [...requests.values()]
            .filter((r) => requestMatches(r, where))
            .filter(
              (r) =>
                !(where.id as { gt?: string } | undefined)?.gt ||
                r.id > (where.id as { gt: string }).gt,
            )
            .sort((a, b) => (a.id < b.id ? -1 : 1))
            .slice(0, take),
        ),
      ),
    },
    verificationDocument: {
      findMany: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(docs.filter((d) => docMatches(d, where))),
      ),
      deleteMany: jest.fn(
        ({
          where,
        }: {
          where: { request_id: string; file_id: { in: string[] } };
        }) => {
          const before = docs.length;
          for (let i = docs.length - 1; i >= 0; i -= 1) {
            const d = docs[i];
            if (
              d.request_id === where.request_id &&
              where.file_id.in.includes(d.file_id)
            )
              docs.splice(i, 1);
          }
          return Promise.resolve({ count: before - docs.length });
        },
      ),
    },
    moderationAutoAction: {
      findFirst: jest.fn(
        ({ where }: { where: { kind: string; target_id: string } }) =>
          Promise.resolve(
            autoActions
              .filter(
                (a) =>
                  a.kind === where.kind &&
                  a.target_id === where.target_id &&
                  a.reversed_at === null,
              )
              .sort((x, y) => +y.created_at - +x.created_at)[0] ?? null,
          ),
      ),
    },
    legalHold: {
      findMany: jest.fn(({ where }: { where: { AND: Where[] } }) => {
        const f = where.AND[1] as {
          target_type: string;
          target_id: { in: string[] };
        };
        return Promise.resolve(
          holds.filter(
            (h) =>
              h.target_type === f.target_type &&
              f.target_id.in.includes(h.target_id),
          ),
        );
      }),
    },
    file: {
      updateMany: jest.fn(({ where, data }: { where: Where; data: Where }) => {
        let count = 0;
        for (const f of files.values()) {
          if (!fileMatches(f, where)) continue;
          Object.assign(f, data);
          count += 1;
        }
        return Promise.resolve({ count });
      }),
      findMany: jest.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          [...files.values()].filter((f) => fileMatches(f, where)),
        ),
      ),
    },
  };

  const storage = {
    configured: true,
    remove: jest.fn(
      (bucket: string, keys: string[], opts: { invalidateKeys?: string[] }) => {
        if (failRemove) return Promise.reject(new Error('S3 down'));
        for (const k of keys) objects.delete(`${bucket}\n${k}`);
        invalidated.push(...(opts.invalidateKeys ?? []));
        return Promise.resolve();
      },
    ),
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  const settingsValues: Record<string, number> = {
    'verification.media.abandoned_days': DEFAULT_ABANDONED_DAYS,
  };
  const settings = {
    number: jest.fn((k: string) => Promise.resolve(settingsValues[k])),
  };
  const release = new FileReleaseService(
    prisma as unknown as PrismaService,
    storage as unknown as S3StorageService,
    logger as unknown as PinoLogger,
  );
  const service = new VerificationMediaPurgeService(
    prisma as unknown as PrismaService,
    release,
    settings as unknown as AppSettingsService,
    logger as unknown as PinoLogger,
  );

  let n = 0;
  /** A request with a selfie and an ID front, each with its previews. */
  function request(
    status: string,
    opts: { updatedAt?: Date; docsAt?: Date; attorney?: string } = {},
  ): { id: string; keys: string[]; fileIds: string[] } {
    n += 1;
    const id = `r${n}`;
    const attorney = opts.attorney ?? `a${n}`;
    requests.set(id, {
      id,
      status,
      attorney_id: attorney,
      updated_at: opts.updatedAt ?? NOW,
    });
    userStatus.set(attorney, userStatus.get(attorney) ?? 'active');
    const keys: string[] = [];
    const fileIds: string[] = [];
    for (const [docType, purpose] of [
      ['selfie', 'verification_selfie'],
      ['drivers_license', 'verification_document'],
    ] as const) {
      const fileId = `f-${id}-${docType}`;
      const key = `${purpose}/s0/2026/11/${fileId}`;
      files.set(fileId, {
        id: fileId,
        purpose,
        s3_bucket: BUCKET,
        s3_key: key,
        deleted_at: null,
        deleted_reason: null,
        purged_at: null,
      });
      // Original, size variants and AVIF twins (thumbnails / re-encodes).
      for (const k of [key, ...derivedKeys(key)])
        objects.add(`${BUCKET}\n${k}`);
      docs.push({
        id: `d-${fileId}`,
        request_id: id,
        doc_type: docType,
        file_id: fileId,
        created_at: opts.docsAt ?? opts.updatedAt ?? NOW,
      });
      keys.push(key);
      fileIds.push(fileId);
    }
    return { id, keys, fileIds };
  }
  /** No object of the request (original or any derived key) is left. */
  const noImageLeft = (keys: string[]): boolean =>
    keys.every((k) =>
      [k, ...derivedKeys(k)].every((d) => !objects.has(`${BUCKET}\n${d}`)),
    );
  const allImagesKept = (keys: string[]): boolean =>
    keys.every((k) =>
      [k, ...derivedKeys(k)].every((d) => objects.has(`${BUCKET}\n${d}`)),
    );

  return {
    service,
    request,
    files,
    docs,
    requests,
    autoActions,
    holds,
    userStatus,
    objects,
    invalidated,
    logger,
    settingsValues,
    noImageLeft,
    allImagesKept,
    failStorage: (v: boolean) => {
      failRemove = v;
    },
  };
}

// ------------------------------------------------------------------ tests

describe('VerificationMediaPurgeService (owner row 52)', () => {
  it('approved: selfie + ID pictures and every preview are deleted at once, the proof stays', async () => {
    const w = world();
    const r = w.request('approved');
    expect(await w.service.afterDecision(r.id, NOW)).toBe(2);
    expect(w.noImageLeft(r.keys)).toBe(true);
    for (const id of r.fileIds) {
      expect(w.files.get(id)).toMatchObject({
        deleted_reason: 'released',
        deleted_at: NOW,
        purged_at: NOW,
      });
    }
    // The CDN edge copies are invalidated too.
    expect([...w.invalidated].sort()).toEqual([...r.keys].sort());
    // The document rows (type, side, timestamps) stay as the proof.
    expect(w.docs.filter((d) => d.request_id === r.id)).toHaveLength(2);
  });

  it('rejected by a person: deleted at once', async () => {
    const w = world();
    const r = w.request('rejected');
    await w.service.afterDecision(r.id, NOW);
    expect(w.noImageLeft(r.keys)).toBe(true);
  });

  it('a human decision after an accepted appeal is final', async () => {
    const w = world();
    const r = w.request('rejected');
    w.autoActions.push({
      kind: AUTO_REJECT_KIND,
      target_id: r.id,
      created_at: new Date(NOW.getTime() - DAY),
      appeal_status: 'accepted',
      reversed_at: new Date(NOW.getTime() - DAY / 2),
    });
    await w.service.afterDecision(r.id, NOW);
    expect(w.noImageLeft(r.keys)).toBe(true);
  });

  it.each(['draft', 'submitted', 'in_review', 'needs_more_info'])(
    'not decided (%s): nothing is deleted',
    async (status) => {
      const w = world();
      const r = w.request(status);
      expect(await w.service.afterDecision(r.id, NOW)).toBe(0);
      expect(w.allImagesKept(r.keys)).toBe(true);
    },
  );

  describe('automatic rejection (appealable)', () => {
    function autoRejected(
      ageDays: number,
      appeal: AutoActionRow['appeal_status'],
    ) {
      const w = world();
      const r = w.request('rejected');
      w.autoActions.push({
        kind: AUTO_REJECT_KIND,
        target_id: r.id,
        created_at: new Date(NOW.getTime() - ageDays * DAY),
        appeal_status: appeal,
        reversed_at: null,
      });
      return { w, r };
    }

    it('kept while the appeal window is open', async () => {
      const { w, r } = autoRejected(2, null);
      await w.service.afterDecision(r.id, NOW);
      await w.service.sweep(NOW);
      expect(w.allImagesKept(r.keys)).toBe(true);
    });

    it('kept while an appeal waits for the owner', async () => {
      const { w, r } = autoRejected(40, 'pending');
      await w.service.sweep(NOW);
      expect(w.allImagesKept(r.keys)).toBe(true);
    });

    it('deleted once the appeal is refused', async () => {
      const { w, r } = autoRejected(3, 'rejected');
      const res = await w.service.sweep(NOW);
      expect(res).toMatchObject({ decided: 1, files: 2 });
      expect(w.noImageLeft(r.keys)).toBe(true);
    });

    it('deleted once the 30-day window closed without an appeal', async () => {
      const { w, r } = autoRejected(AUTO_REJECT_APPEAL_DAYS + 1, null);
      await w.service.sweep(NOW);
      expect(w.noImageLeft(r.keys)).toBe(true);
    });

    it('200+ rejections open to appeal never hide a final one behind them', async () => {
      const w = world();
      for (let i = 0; i < 205; i += 1) {
        const open = w.request('rejected');
        w.autoActions.push({
          kind: AUTO_REJECT_KIND,
          target_id: open.id,
          created_at: NOW,
          appeal_status: null,
          reversed_at: null,
        });
      }
      const last = w.request('approved');
      await w.service.sweep(NOW);
      expect(w.noImageLeft(last.keys)).toBe(true);
    });

    it('an account leaving keeps the rows of a decided request', async () => {
      const w = world();
      const r = w.request('approved', { attorney: 'gone' });
      w.userStatus.set('gone', 'deletion_pending');
      await w.service.sweep(NOW);
      expect(w.noImageLeft(r.keys)).toBe(true);
      expect(w.docs.filter((d) => d.request_id === r.id)).toHaveLength(2);
    });

    it('the window is the appeal window of AutoAppealsService', () => {
      expect(AUTO_REJECT_APPEAL_DAYS).toBe(AUTO_APPEAL_WINDOW_DAYS);
    });
  });

  describe('abandoned requests', () => {
    const old = new Date(NOW.getTime() - (DEFAULT_ABANDONED_DAYS + 1) * DAY);

    it.each(['draft', 'needs_more_info'])(
      '%s idle past the days: deleted by the sweep',
      async (status) => {
        const w = world();
        const r = w.request(status, { updatedAt: old });
        const res = await w.service.sweep(NOW);
        expect(res.abandoned).toBe(1);
        expect(w.noImageLeft(r.keys)).toBe(true);
        // Not decided: the rows go too, so the attorney uploads anew
        // instead of being stuck on deleted files.
        expect(w.docs.filter((d) => d.request_id === r.id)).toHaveLength(0);
      },
    );

    it('a fresh upload keeps the request alive', async () => {
      const w = world();
      const r = w.request('draft', { updatedAt: old, docsAt: NOW });
      await w.service.sweep(NOW);
      expect(w.allImagesKept(r.keys)).toBe(true);
    });

    it('a submitted request waiting for us is never "abandoned"', async () => {
      const w = world();
      const r = w.request('submitted', { updatedAt: old });
      await w.service.sweep(NOW);
      expect(w.allImagesKept(r.keys)).toBe(true);
    });

    it('0 days = only after a decision', async () => {
      const w = world();
      w.settingsValues['verification.media.abandoned_days'] = 0;
      const r = w.request('draft', { updatedAt: old });
      await w.service.sweep(NOW);
      expect(w.allImagesKept(r.keys)).toBe(true);
    });
  });

  describe('account deletion', () => {
    it('a request of an account being deleted loses its pictures at the next sweep', async () => {
      const w = world();
      const r = w.request('submitted', { attorney: 'leaving' });
      w.userStatus.set('leaving', 'deletion_pending');
      const res = await w.service.sweep(NOW);
      expect(res.accountDeletion).toBe(1);
      expect(w.noImageLeft(r.keys)).toBe(true);
      expect(w.docs.filter((d) => d.request_id === r.id)).toHaveLength(0);
    });

    it('the anonymization releases verification files too (second net)', () => {
      expect(ANONYMIZED_FILE_PURPOSES).toEqual(
        expect.arrayContaining([
          'verification_document',
          'verification_selfie',
        ]),
      );
    });
  });

  it('never-attached uploads are no longer exempt from the orphan cleanup', () => {
    expect(CLEANUP_EXEMPT_PURPOSES).not.toContain('verification_selfie');
    expect(CLEANUP_EXEMPT_PURPOSES).not.toContain('verification_document');
  });

  it('a legal hold on the attorney keeps the evidence', async () => {
    const w = world();
    const r = w.request('approved', { attorney: 'held' });
    w.holds.push({ target_type: 'user', target_id: 'held' });
    expect(await w.service.afterDecision(r.id, NOW)).toBe(0);
    expect(w.allImagesKept(r.keys)).toBe(true);
  });

  it('a storage failure never fails the decision; the sweep finishes the job', async () => {
    const w = world();
    const r = w.request('approved');
    w.failStorage(true);
    await expect(w.service.afterDecision(r.id, NOW)).resolves.toBe(2);
    expect(w.allImagesKept(r.keys)).toBe(true);
    expect(w.files.get(r.fileIds[0])?.purged_at).toBeNull();
    w.failStorage(false);
    const res = await w.service.sweep(NOW);
    expect(res.files).toBe(2);
    expect(w.noImageLeft(r.keys)).toBe(true);
  });

  it('logs carry ids and counts only — no object key, link or bytes', async () => {
    const w = world();
    const r = w.request('approved');
    await w.service.afterDecision(r.id, NOW);
    const logged = JSON.stringify([
      ...w.logger.info.mock.calls,
      ...w.logger.error.mock.calls,
    ]);
    for (const k of r.keys) expect(logged).not.toContain(k);
    expect(logged).not.toMatch(/https?:\/\//);
  });
});

// ------------------------------------------------------- decision hooks

/** A transaction client whose every delegate method answers a default. */
function autoTx(overrides: Record<string, Record<string, unknown>> = {}) {
  const defaults: Record<string, unknown> = {
    findMany: [],
    findUnique: null,
    findFirst: null,
    count: 1,
    updateMany: { count: 1 },
  };
  const tx: Record<string, unknown> = new Proxy(
    {},
    {
      get: (_t, model: string) => {
        if (model === 'then') return undefined;
        if (model === '$transaction')
          return (fn: (t: unknown) => Promise<unknown>) => fn(tx);
        return new Proxy(
          {},
          {
            get: (_m, method: string) =>
              jest.fn(() =>
                Promise.resolve(
                  overrides[model]?.[method] ??
                    (method in defaults ? defaults[method] : {}),
                ),
              ),
          },
        );
      },
    },
  );
  return tx;
}

describe('the deciding services call the deletion (row 52)', () => {
  /** The deletion service the deciders call, and its spy. */
  const media = () => {
    const afterDecision = jest.fn().mockResolvedValue(2);
    return {
      m: { afterDecision } as unknown as VerificationMediaPurgeService,
      afterDecision,
    };
  };
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;

  it('automatic / registry / Persona approval (VerificationChecksService.approve)', async () => {
    const { m, afterDecision } = media();
    const tx = autoTx({
      verificationRequest: {
        findUnique: { id: 'r1', status: 'submitted', attorney_id: 'a1' },
      },
    });
    const service = new VerificationChecksService(
      tx as unknown as PrismaService,
      {} as never,
      { emit: jest.fn() } as never,
      { recompute: jest.fn() } as never,
      logger,
      undefined,
      undefined,
      m,
    );
    jest
      .spyOn(
        service as unknown as { trustRecompute: () => Promise<void> },
        'trustRecompute',
      )
      .mockResolvedValue();
    await service.approve('r1', 'note', NOW);
    expect(afterDecision).toHaveBeenCalledWith('r1', NOW);
  });

  function adminService(m: VerificationMediaPurgeService) {
    const tx = autoTx({
      verificationRequest: {
        findUnique: {
          id: 'r1',
          status: 'in_review',
          reviewed_by: 'admin-1',
          attorney_id: 'a1',
          submitted_at: NOW,
        },
      },
      attorneyLicense: {
        findMany: [
          {
            id: 'l1',
            license_status: 'verified',
            verified_by: 'admin-1',
            updated_at: NOW,
          },
        ],
      },
    });
    const service = new VerificationAdminService(
      tx as unknown as PrismaService,
      {} as never,
      { record: jest.fn() } as never,
      { emit: jest.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        recompute: jest.fn(),
        confirmDocuments: jest.fn(),
        clearByStaff: jest.fn(),
      } as never,
      { blockOnReject: jest.fn().mockResolvedValue(false) } as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      m,
    );
    jest
      .spyOn(service, 'card')
      .mockResolvedValue({} as Awaited<ReturnType<typeof service.card>>);
    return service;
  }
  const admin = { id: 'admin-1', adminRole: 'verifier', ip: null } as never;

  it("a verifier's approval", async () => {
    const { m, afterDecision } = media();
    await adminService(m).approve(admin, 'r1', NOW);
    expect(afterDecision).toHaveBeenCalledWith('r1', NOW);
  });

  it("a verifier's rejection", async () => {
    const { m, afterDecision } = media();
    await adminService(m).reject(
      admin,
      'r1',
      { rejectionCode: 'selfie_mismatch', comment: '' } as never,
      NOW,
    );
    expect(afterDecision).toHaveBeenCalledWith('r1', NOW);
  });
});

// --------------------------------------------------- Rekognition storage

describe('Amazon Rekognition keeps nothing (row 52)', () => {
  /** Every non-test source file of the API. */
  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return sources(p);
      return p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
    });
  }

  it('only CompareFaces: no face collection, no stored face template', () => {
    const root = join(__dirname, '..', '..', '..');
    const offenders = sources(root).filter((p) =>
      /IndexFaces|CreateCollection|SearchFaces|CreateUser(Command)?\b.*rekognition|AssociateFaces/i.test(
        readFileSync(p, 'utf8'),
      ),
    );
    expect(offenders).toEqual([]);
    const provider = readFileSync(
      join(
        __dirname,
        '..',
        'providers',
        'rekognition-id-verification.provider.ts',
      ),
      'utf8',
    );
    const commands = [...provider.matchAll(/(\w+)Command\b/g)].map((m) => m[1]);
    expect(new Set(commands)).toEqual(new Set(['CompareFaces']));
  });
});

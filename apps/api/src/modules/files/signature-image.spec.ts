import {
  loadSignatureImage,
  SIGNATURE_IMAGE_PREFIX,
  storeSignatureImage,
} from './signature-image';
import {
  parseSignatureBackfillArgs,
  runSignatureBackfill,
} from './signature-image-backfill';

// CONTENT_MEDIA_VERIFY 17.11 №7: signature pictures live in the private
// documents bucket, the row keeps only the key (expand → backfill → contract).
function fakeStorage() {
  const objects = new Map<string, Buffer>();
  return {
    objects,
    awsBucket: (kind: string) => `aws-${kind}`,
    put: jest.fn((bucket: string, key: string, body: Buffer) => {
      objects.set(`${bucket}/${key}`, body);
      return Promise.resolve();
    }),
    read: jest.fn((bucket: string, key: string) => {
      const o = objects.get(`${bucket}/${key}`);
      return o ? Promise.resolve(o) : Promise.reject(new Error('NoSuchKey'));
    }),
    head: jest.fn((bucket: string, key: string) =>
      Promise.resolve(objects.has(`${bucket}/${key}`) ? { size: 1 } : null),
    ),
  };
}

type Row = {
  id: string;
  request_id: string;
  image_png: Uint8Array | null;
  image_key: string | null;
};

function fakePrisma(rows: Row[]) {
  const match = (r: Row, w: Record<string, unknown>): boolean =>
    Object.entries(w).every(([k, v]) => {
      const cur = r[k as keyof Row];
      if (v === null) return cur === null;
      if (typeof v === 'object' && v && 'not' in v) return cur !== null;
      if (typeof v === 'object' && v && 'gt' in v)
        return String(cur) > String((v as { gt: string }).gt);
      return cur === v;
    });
  return {
    caseSignature: {
      findMany: jest.fn((a: { where: Record<string, unknown>; take: number }) =>
        Promise.resolve(
          rows
            .filter((r) => match(r, a.where))
            .sort((x, y) => (x.id < y.id ? -1 : 1))
            .slice(0, a.take)
            .map((r) => ({ ...r })),
        ),
      ),
      updateMany: jest.fn(
        (a: { where: Record<string, unknown>; data: Partial<Row> }) => {
          const hit = rows.filter((r) => match(r, a.where));
          for (const r of hit) Object.assign(r, a.data);
          return Promise.resolve({ count: hit.length });
        },
      ),
    },
  };
}

const png = (n: number) => Buffer.from([0x89, 0x50, 0x4e, 0x47, n]);

describe('signature pictures in private storage', () => {
  it('stores into the documents bucket under case-signatures/<request>/ and reads back', async () => {
    const s = fakeStorage();
    const key = await storeSignatureImage(s, 'req-1', png(1));
    expect(key.startsWith(`${SIGNATURE_IMAGE_PREFIX}req-1/`)).toBe(true);
    expect(key.endsWith('.png')).toBe(true);
    expect(s.put).toHaveBeenCalledWith(
      'aws-documents',
      key,
      png(1),
      'image/png',
    );
    await expect(loadSignatureImage(s, { image_key: key })).resolves.toEqual(
      png(1),
    );
  });

  it('reads old rows from their bytes; a typed signature has none', async () => {
    const s = fakeStorage();
    await expect(
      loadSignatureImage(s, { image_key: null, image_png: png(2) }),
    ).resolves.toEqual(png(2));
    await expect(loadSignatureImage(s, {})).resolves.toBeNull();
  });

  it('falls back to the kept bytes when the object cannot be read', async () => {
    const s = fakeStorage();
    await expect(
      loadSignatureImage(s, {
        image_key: 'case-signatures/x.png',
        image_png: png(3),
      }),
    ).resolves.toEqual(png(3));
    await expect(
      loadSignatureImage(s, { image_key: 'case-signatures/x.png' }),
    ).rejects.toThrow('NoSuchKey');
  });

  it('backfill: dry run counts, apply copies in batches, a rerun changes nothing, clear empties bytes only with the object there', async () => {
    const rows: Row[] = [
      { id: 'a', request_id: 'r1', image_png: png(1), image_key: null },
      { id: 'b', request_id: 'r1', image_png: png(2), image_key: null },
      { id: 'c', request_id: 'r2', image_png: png(3), image_key: null },
      { id: 'd', request_id: 'r2', image_png: null, image_key: null }, // typed
    ];
    const s = fakeStorage();
    const prisma = fakePrisma(rows);
    const log = jest.fn();
    const base = { clear: false, limit: 0, batch: 2, log };

    const dry = await runSignatureBackfill(
      { prisma: prisma as never, storage: s },
      { ...base, apply: false },
    );
    expect(dry).toEqual({ candidates: 3, stored: 0, cleared: 0, failed: 0 });
    expect(s.put).not.toHaveBeenCalled();

    const done = await runSignatureBackfill(
      { prisma: prisma as never, storage: s },
      { ...base, apply: true },
    );
    expect(done.stored).toBe(3);
    for (const r of rows.slice(0, 3)) {
      expect(r.image_key).toMatch(/^case-signatures\/r\d\/.+\.png$/);
      expect(s.objects.get(`aws-documents/${r.image_key}`)).toEqual(
        Buffer.from(r.image_png!),
      );
    }
    expect(rows[3].image_key).toBeNull();

    const again = await runSignatureBackfill(
      { prisma: prisma as never, storage: s },
      { ...base, apply: true },
    );
    expect(again).toEqual({ candidates: 0, stored: 0, cleared: 0, failed: 0 });

    // Step 2: one object went missing — its bytes stay.
    s.objects.delete(`aws-documents/${rows[1].image_key}`);
    const cleared = await runSignatureBackfill(
      { prisma: prisma as never, storage: s },
      { ...base, apply: true, clear: true },
    );
    expect(cleared).toMatchObject({ cleared: 2, failed: 1 });
    expect(rows[0].image_png).toBeNull();
    expect(rows[1].image_png).not.toBeNull();
    expect(rows[2].image_png).toBeNull();
  });

  it('parses only known flags', () => {
    expect(parseSignatureBackfillArgs(['--apply', '--limit=20'])).toEqual({
      apply: true,
      clear: false,
      limit: 20,
      batch: 100,
    });
    expect(() => parseSignatureBackfillArgs(['--drop'])).toThrow('unknown');
  });
});

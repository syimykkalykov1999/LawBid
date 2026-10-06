import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { AdminActor } from '../admin-auth/admin-auth.decorators';
import type { BootstrapService } from '../feature-flags/services/bootstrap.service';
import { LegalDocumentsService } from './legal-documents.service';

const ADMIN: AdminActor = {
  id: 'adm',
  adminRole: 'super_admin',
  sessionId: 's',
  justification: null,
  ip: '203.0.113.1',
};

type Row = Record<string, unknown>;

/** A tiny in-memory legal_documents table. */
function setup(seed: Row[] = []) {
  let n = 0;
  const rows: Row[] = seed.map((r) => ({
    id: `id${++n}`,
    content_url: null,
    requires_reacceptance: true,
    changed_by: null,
    change_note: null,
    rollback_of_id: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    updated_at: new Date('2026-10-01T00:00:00Z'),
    published_at: null,
    ...r,
  }));
  const match = (r: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([k, v]) => {
      if (k === 'OR') return (v as Row[]).some((w) => match(r, w));
      if (v && typeof v === 'object' && 'in' in (v as Row)) {
        return (v as { in: unknown[] }).in.includes(r[k]);
      }
      return r[k] === v;
    });
  const legalDocument = {
    findFirst: jest.fn(({ where }: { where: Row }) =>
      Promise.resolve(rows.find((r) => match(r, where)) ?? null),
    ),
    findMany: jest.fn(({ where }: { where: Row }) =>
      Promise.resolve(rows.filter((r) => match(r, where))),
    ),
    findUnique: jest.fn(({ where }: { where: Row }) =>
      Promise.resolve(rows.find((r) => match(r, where)) ?? null),
    ),
    update: jest.fn(({ where, data }: { where: Row; data: Row }) => {
      const r = rows.find((x) => match(x, where))!;
      Object.assign(r, data, { updated_at: new Date() });
      return Promise.resolve({ ...r });
    }),
    create: jest.fn(({ data }: { data: Row }) => {
      const r = {
        id: `id${++n}`,
        created_at: new Date(),
        updated_at: new Date(),
        published_at: null,
        content_url: null,
        requires_reacceptance: true,
        changed_by: null,
        change_note: null,
        rollback_of_id: null,
        ...data,
      };
      rows.push(r);
      return Promise.resolve({ ...r });
    }),
    delete: jest.fn(({ where }: { where: Row }) => {
      const i = rows.findIndex((x) => match(x, where));
      return Promise.resolve(rows.splice(i, 1)[0]);
    }),
  };
  const prisma: Record<string, unknown> = {
    legalDocument,
    user: { findMany: jest.fn().mockResolvedValue([]) },
  };
  prisma.$transaction = (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const bootstrap = { invalidate: jest.fn().mockResolvedValue(undefined) };
  const svc = new LegalDocumentsService(
    prisma as unknown as PrismaService,
    audit as unknown as AuditLogService,
    bootstrap as unknown as BootstrapService,
  );
  return { svc, rows, audit, bootstrap };
}

const published = (over: Row) => ({
  doc_type: 'eula',
  locale: 'en',
  version: '2026-10-01.1',
  status: 'published',
  is_current: true,
  content_md: '# EULA v1 text of the agreement',
  published_at: new Date('2026-10-01T10:00:00Z'),
  ...over,
});

describe('LegalDocumentsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-05T12:00:00Z'));
  });
  afterEach(() => jest.useRealTimers());

  it('keeps one draft per type and language and edits it in place', async () => {
    const { svc, rows } = setup();
    const a = await svc.saveDraft(ADMIN, 'eula', 'en', {
      contentMd: '# First version of the text',
    });
    const b = await svc.saveDraft(ADMIN, 'eula', 'en', {
      contentMd: '# Second version of the text',
      changeNote: 'fix',
    });
    expect(b.id).toBe(a.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'draft',
      version: 'draft',
      is_current: false,
      content_md: '# Second version of the text',
      changed_by: 'adm',
    });
  });

  it('publishes the draft as a date-numbered version and archives the previous one', async () => {
    const { svc, rows, audit, bootstrap } = setup([
      published({}),
      {
        doc_type: 'eula',
        locale: 'en',
        version: 'draft',
        status: 'draft',
        is_current: false,
        content_md: '# EULA v2 text of the agreement',
      },
    ]);
    const out = await svc.publish(ADMIN, 'eula', 'en', {
      changeNote: 'new refund wording',
    });
    expect(out).toMatchObject({
      version: '2026-10-05.1',
      status: 'published',
      isCurrent: true,
      requiresReacceptance: true,
      changeNote: 'new refund wording',
    });
    const old = rows.find((r) => r.version === '2026-10-01.1')!;
    expect(old).toMatchObject({ status: 'archived', is_current: false });
    expect(rows.filter((r) => r.is_current)).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'legal.document.publish',
        before: expect.objectContaining({ currentVersion: '2026-10-01.1' }),
      }),
      expect.anything(),
    );
    expect(bootstrap.invalidate).toHaveBeenCalled();
  });

  it('stores the «ask again» switch on the version', async () => {
    const { svc } = setup([
      {
        doc_type: 'cookies',
        locale: 'ru',
        version: 'draft',
        status: 'draft',
        is_current: false,
        content_md: '# Куки: текст политики',
      },
    ]);
    const out = await svc.publish(ADMIN, 'cookies', 'ru', {
      requiresReacceptance: false,
    });
    expect(out.requiresReacceptance).toBe(false);
  });

  it('numbers a second publication of the day .2', async () => {
    const { svc } = setup([
      published({ version: '2026-10-05.1', is_current: true }),
      {
        doc_type: 'eula',
        locale: 'en',
        version: 'draft',
        status: 'draft',
        is_current: false,
        content_md: '# Another text of the agreement',
      },
    ]);
    expect((await svc.publish(ADMIN, 'eula', 'en', {})).version).toBe(
      '2026-10-05.2',
    );
  });

  it('refuses to publish without a draft or with an unchanged draft', async () => {
    const none = setup([published({})]);
    await expect(
      none.svc.publish(ADMIN, 'eula', 'en', {}),
    ).rejects.toMatchObject({
      response: { code: 'LEGAL_DOCUMENT_INVALID_STATE' },
    });
    const same = setup([
      published({}),
      {
        doc_type: 'eula',
        locale: 'en',
        version: 'draft',
        status: 'draft',
        is_current: false,
        content_md: '# EULA v1 text of the agreement',
      },
    ]);
    await expect(
      same.svc.publish(ADMIN, 'eula', 'en', {}),
    ).rejects.toMatchObject({
      response: { code: 'LEGAL_DOCUMENT_INVALID_STATE' },
    });
  });

  it('rolls back by publishing the old text as a new version, deleting nothing', async () => {
    const { svc, rows, audit } = setup([
      published({
        id: 'v1',
        version: '2026-10-01.1',
        is_current: false,
        status: 'archived',
      }),
      published({
        id: 'v2',
        version: '2026-10-03.1',
        content_md: '# EULA v2 text of the agreement',
      }),
    ]);
    const before = rows.length;
    const out = await svc.rollback(ADMIN, rows[0].id as string, {});
    expect(out).toMatchObject({
      version: '2026-10-05.1',
      isCurrent: true,
      contentMd: '# EULA v1 text of the agreement',
      rollbackOfId: rows[0].id,
    });
    expect(rows).toHaveLength(before + 1);
    expect(rows.find((r) => r.version === '2026-10-03.1')).toMatchObject({
      status: 'archived',
      is_current: false,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'legal.document.rollback' }),
      expect.anything(),
    );
  });

  it('cannot roll back to the current version or to a draft', async () => {
    const { svc, rows } = setup([
      published({}),
      {
        doc_type: 'eula',
        locale: 'ru',
        version: 'draft',
        status: 'draft',
        is_current: false,
        content_md: '# Черновик текста соглашения',
      },
    ]);
    await expect(
      svc.rollback(ADMIN, rows[0].id as string, {}),
    ).rejects.toMatchObject({
      response: { code: 'LEGAL_DOCUMENT_INVALID_STATE' },
    });
    await expect(
      svc.rollback(ADMIN, rows[1].id as string, {}),
    ).rejects.toMatchObject({
      response: { code: 'LEGAL_DOCUMENT_INVALID_STATE' },
    });
  });

  it('lists every type with the state of both languages', async () => {
    const { svc } = setup([
      published({}),
      {
        doc_type: 'eula',
        locale: 'en',
        version: 'draft',
        status: 'draft',
        is_current: false,
        content_md: '# next',
      },
      {
        doc_type: 'refund',
        locale: 'ru',
        version: 'draft',
        status: 'draft',
        is_current: false,
        content_md: '# возвраты',
      },
    ]);
    const list = await svc.list();
    expect(list.map((r) => r.docType)).toContain('dmca_policy');
    const eula = list.find((r) => r.docType === 'eula')!;
    expect(eula.locales.map((l) => [l.locale, l.state])).toEqual([
      ['en', 'published_draft'],
      ['ru', 'none'],
    ]);
    expect(list.find((r) => r.docType === 'refund')!.locales[1].state).toBe(
      'draft',
    );
  });

  it('serves the public text in the language, else English', async () => {
    const { svc } = setup([
      published({ locale: 'en' }),
      published({ locale: 'ru', content_md: '# Соглашение' }),
      published({ doc_type: 'refund', content_md: '# Refunds' }),
    ]);
    expect((await svc.currentText('eula', 'ru')).contentMd).toBe(
      '# Соглашение',
    );
    const fallback = await svc.currentText('refund', 'ru');
    expect(fallback.locale).toBe('en');
    await expect(svc.currentText('cookies', 'en')).rejects.toMatchObject({
      response: { code: 'NOT_FOUND' },
    });
  });
});

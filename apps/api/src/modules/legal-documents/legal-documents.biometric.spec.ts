import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AppSettingsService } from '../../common/app-settings/app-settings.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditLogService } from '../admin-access/audit-log.service';
import type { BootstrapService } from '../feature-flags/services/bootstrap.service';
import {
  biometricSection,
  fillLiveSettings,
  liveSettingKeys,
} from './legal-documents.logic';
import {
  BIOMETRIC_TAG,
  LegalDocumentsSeed,
  seedDir,
} from './legal-documents.seed';
import { LegalDocumentsService } from './legal-documents.service';

/** D1-50 (13.11): a public biometric retention policy (BIPA 740 ILCS
 * 14/15(a)) in the live privacy texts, with the admin's retention periods. */
describe('biometric policy in the privacy texts', () => {
  const dir = seedDir()!;
  const asset = (l: string) =>
    readFileSync(join(dir, `privacy.${l}.md`), 'utf8');

  it('both shipped texts carry the section and take the periods from the settings', () => {
    for (const l of ['en', 'ru']) {
      const s = biometricSection(asset(l));
      expect(s).not.toBeNull();
      expect(s).toContain('{{verification.face_match.retention_days}}');
      expect(s).toContain('{{verification.media.abandoned_days}}');
      expect(s!.startsWith('## ')).toBe(true);
      expect(s).not.toMatch(/^## \d/);
    }
  });

  it('fills only known keys', () => {
    const md = 'kept {{verification.face_match.retention_days}} days, {{x.y}}';
    expect(liveSettingKeys(md)).toEqual([
      'verification.face_match.retention_days',
    ]);
    expect(
      fillLiveSettings(md, { 'verification.face_match.retention_days': 45 }),
    ).toBe('kept 45 days, {{x.y}}');
  });

  it('the public read fills the live admin value', async () => {
    const row = {
      id: 'p1',
      doc_type: 'privacy',
      locale: 'en',
      version: '2026-11-13.1',
      status: 'published',
      is_current: true,
      published_at: new Date(),
      requires_reacceptance: false,
      content_md: 'plus {{verification.face_match.retention_days}} days',
    };
    const prisma = {
      legalDocument: { findMany: jest.fn().mockResolvedValue([row]) },
    };
    const settings = { number: jest.fn().mockResolvedValue(45) };
    const svc = new LegalDocumentsService(
      prisma as unknown as PrismaService,
      {} as AuditLogService,
      {} as BootstrapService,
      settings as unknown as AppSettingsService,
    );
    const doc = await svc.currentText('privacy', 'en');
    expect(doc.contentMd).toBe('plus 45 days');
    expect(settings.number).toHaveBeenCalledWith(
      'verification.face_match.retention_days',
    );
  });

  function seedWith(rows: Record<string, Record<string, unknown>[]>) {
    const prisma = {
      legalDocument: {
        findMany: jest.fn(({ where }: { where: { locale: string } }) =>
          Promise.resolve(rows[where.locale] ?? []),
        ),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return {
      prisma,
      seed: new LegalDocumentsSeed(prisma as unknown as PrismaService),
    };
  }

  it('prepares the section once as a DRAFT of the next version; the current text stays current, nothing is published', async () => {
    const { seed, prisma } = seedWith({
      en: [
        {
          id: 'p1',
          version: '2026-10-16.1',
          status: 'published',
          is_current: true,
          content_md: '# Privacy Policy\n\nOwner text.',
        },
      ],
      // No published Russian text: left to the owner.
      ru: [{ id: 'r1', version: 'draft', status: 'draft', content_md: '# x' }],
    });
    expect(await seed.publishBiometricSection()).toBe(1);
    const data = (
      prisma.legalDocument.create.mock.calls as [
        { data: Record<string, unknown> },
      ][]
    )[0][0].data;
    const md = String(data.content_md);
    expect(
      md.startsWith(
        '# Privacy Policy\n\nOwner text.\n\n## Biometric information',
      ),
    ).toBe(true);
    expect(md).toContain('{{verification.face_match.retention_days}}');
    expect(md).not.toContain('[We have opted out');
    expect(data).toMatchObject({
      doc_type: 'privacy',
      locale: 'en',
      status: 'draft',
      is_current: false,
      requires_reacceptance: false,
    });
    expect(data).not.toHaveProperty('published_at');
    expect(String(data.change_note)).toContain(BIOMETRIC_TAG);
    // The owner's current text is left as it is (publishing is his).
    expect(prisma.legalDocument.update).not.toHaveBeenCalled();
  });

  it('never twice, and never over a text that already has the section', async () => {
    const { seed, prisma } = seedWith({
      en: [
        {
          id: 'p2',
          version: '2026-11-13.1',
          status: 'published',
          is_current: true,
          content_md: '# P\n\nedited by the owner',
          change_note: `${BIOMETRIC_TAG} x`,
        },
      ],
      ru: [
        {
          id: 'r2',
          version: '2026-11-13.1',
          status: 'published',
          is_current: true,
          content_md: '# П\n\n## 7. Биометрические данные\n\nтекст',
        },
      ],
    });
    expect(await seed.publishBiometricSection()).toBe(0);
    expect(prisma.legalDocument.create).not.toHaveBeenCalled();
  });
});

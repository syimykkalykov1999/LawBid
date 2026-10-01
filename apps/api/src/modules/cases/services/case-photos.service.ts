import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { FilesService } from '../../files/files.service';
import type { CasePhotoDto } from '../dto/case-responses.dto';

type Tx = Prisma.TransactionClient;

/**
 * Owner decision 2026-09-30 (OQ-031): 0–9 photos per case. Files are
 * `case_photo` (documents bucket, antivirus-clean, owned by the author).
 * Visibility: the case owner always; an attorney only once THEIR bid was
 * accepted. Other attorneys (feed, detail, bidding) see just the count.
 */
@Injectable()
export class CasePhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  /** 404/409 for files that are not the author's clean case photos. */
  async assertAttachable(userId: string, fileIds: string[]): Promise<void> {
    for (const id of fileIds) {
      await this.files.assertAttachable(userId, id, [
        'case_photo',
        'case_attachment',
      ]);
    }
  }

  async attach(tx: Tx, caseId: string, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    await tx.casePhoto.createMany({
      data: fileIds.map((file_id, position) => ({
        case_id: caseId,
        file_id,
        position,
      })),
    });
  }

  /** Owner 2026-09-30: the first photo of each case the viewer may see
   * photos of (owner or accepted attorney), for the "Mine" grid. */
  async coverUrls(
    caseIds: string[],
    viewerId: string,
  ): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (caseIds.length === 0) return out;
    const cases = await this.prisma.case.findMany({
      where: { id: { in: caseIds } },
      select: {
        id: true,
        client_id: true,
        accepted_bid: { select: { attorney_id: true } },
        photos: {
          orderBy: { position: 'asc' },
          select: { file_id: true, file: { select: { mime: true } } },
        },
      },
    });
    const first = new Map<string, string>();
    for (const k of cases) {
      const allowed =
        k.client_id === viewerId || k.accepted_bid?.attorney_id === viewerId;
      const photo = k.photos.find((p) => p.file.mime.startsWith('image/'));
      if (allowed && photo) first.set(photo.file_id, k.id);
    }
    const urls = await this.files.casePhotoUrls([...first.keys()]);
    for (const u of urls) {
      const caseId = first.get(u.fileId);
      if (caseId) out.set(caseId, u.previewUrl);
    }
    return out;
  }

  /** Photos for the owner or the accepted attorney; empty for anyone
   * else. `count` is always the real number (so a bidder knows photos
   * exist and will be shared after acceptance). */
  async forViewer(
    caseId: string,
    viewerId: string,
  ): Promise<{ photos: CasePhotoDto[]; photosCount: number }> {
    const kase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        client_id: true,
        accepted_bid: { select: { attorney_id: true } },
        photos: { orderBy: { position: 'asc' }, select: { file_id: true } },
      },
    });
    if (!kase) return { photos: [], photosCount: 0 };
    const allowed =
      kase.client_id === viewerId ||
      kase.accepted_bid?.attorney_id === viewerId;
    const ids = kase.photos.map((p) => p.file_id);
    return {
      photos: allowed ? await this.files.casePhotoUrls(ids) : [],
      photosCount: ids.length,
    };
  }
}

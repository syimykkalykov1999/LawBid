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

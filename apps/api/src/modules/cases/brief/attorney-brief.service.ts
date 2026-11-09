import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { paymentTermsOf } from '../../bids/bids.public';
import { caseNotFound } from '../domain/case-state-machine';
import {
  BRIEF_MAX_PHOTOS,
  renderAttorneyBriefPdf,
  type BriefTerms,
} from './attorney-brief.pdf';

/** RFC 4122 §4.3 name-based UUID (version 5, SHA-1) — the algorithm of the
 * `uuid` package's v5 (MIT), so one bid always maps to one brief file. */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(name, 'utf8')]))
    .digest();
  const b = hash.subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x50;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Namespace of the brief ids (a random v4, fixed forever). */
const BRIEF_NAMESPACE = '6f1c2a8e-4b7d-4e3a-9c55-2d0b7e9a1f43';

/** The brief's file id for an accepted bid. */
export const briefFileIdOf = (bidId: string): string =>
  uuidV5(`attorney-brief:${bidId}`, BRIEF_NAMESPACE);

const fullName = (first: string | null, last: string | null): string | null =>
  [first, last].filter((x) => x && x.trim()).join(' ') || null;

/**
 * Sweep A-c1 (owner A-044, 2026-11-09): once a bid is accepted the attorney
 * gets one PDF — the client's contact data, the accepted terms and up to
 * nine case photos — as a file in the case's Files tab that only the
 * attorney sees (the client's list never carries it; the PDF route answers
 * 404 to anyone but the accepted attorney). Made on first need (the
 * attorney opens Files, or downloads it) and kept: the file id is
 * name-based on the bid, so two parallel opens store it once.
 */
@Injectable()
export class AttorneyBriefService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FilesService,
  ) {}

  private async acceptedOf(caseId: string) {
    const c = await this.prisma.case.findFirst({
      where: { id: caseId, deleted_at: null },
      select: {
        id: true,
        title: true,
        client_id: true,
        accepted_bid: {
          select: {
            id: true,
            attorney_id: true,
            fee_type: true,
            amount_cents: true,
            percent_bps: true,
            payment_terms: true,
            decided_at: true,
            updated_at: true,
          },
        },
      },
    });
    return c?.accepted_bid ? { ...c, bid: c.accepted_bid } : null;
  }

  /** The brief's file id for the case, made now when it does not exist
   * yet; null while no bid is accepted (or the file was deleted). */
  async ensure(caseId: string): Promise<string | null> {
    const c = await this.acceptedOf(caseId);
    if (!c) return null;
    const id = briefFileIdOf(c.bid.id);
    const had = await this.prisma.file.findUnique({
      where: { id },
      select: { deleted_at: true },
    });
    if (had) return had.deleted_at ? null : id;
    const pdf = await this.render(c);
    try {
      await this.files.storeGenerated(
        c.bid.attorney_id,
        'case_attachment',
        pdf,
        'application/pdf',
        id,
      );
    } catch (error) {
      // A parallel open stored it first: same id, same bytes.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
    }
    return id;
  }

  /** GET /cases/:id/attorney-brief.pdf — the accepted attorney only;
   * the client, other attorneys and strangers get 404. */
  async pdfFor(
    user: RequestUser,
    caseId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const c = await this.acceptedOf(caseId);
    if (!c || c.bid.attorney_id !== user.sub) throw caseNotFound();
    const id = await this.ensure(caseId);
    if (!id) throw caseNotFound();
    const { data } = await this.files.readClean(id);
    return {
      buffer: data,
      filename: `lawbid-case-${caseId.slice(0, 8)}-brief.pdf`,
    };
  }

  private async render(
    c: NonNullable<Awaited<ReturnType<AttorneyBriefService['acceptedOf']>>>,
  ): Promise<Buffer> {
    const [client, attorney, disclosure, photos] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: c.client_id },
        select: {
          first_name: true,
          last_name: true,
          phone_e164: true,
          email: true,
          client_profile: {
            select: {
              preferred_contact_method: true,
              preferred_contact_note: true,
            },
          },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: c.bid.attorney_id },
        select: { first_name: true, last_name: true, ui_language: true },
      }),
      this.prisma.contactDisclosure.findFirst({
        where: { bid_id: c.bid.id },
        select: { fields: true },
      }),
      this.prisma.casePhoto.findMany({
        where: {
          case_id: c.id,
          source: 'case',
          file: { mime: { startsWith: 'image/' }, deleted_at: null },
        },
        orderBy: { position: 'asc' },
        take: BRIEF_MAX_PHOTOS,
        select: { file_id: true },
      }),
    ]);
    // Only what was disclosed at acceptance (docs/04 §8.2); before the
    // disclosure log existed, everything on file.
    const shown = new Set<string>(
      disclosure?.fields ?? ['name', 'phone', 'email', 'preferred_contact'],
    );
    const images: Buffer[] = [];
    for (const p of photos) {
      try {
        images.push((await this.files.readClean(p.file_id)).data);
      } catch {
        // not clean / gone: left out
      }
    }
    const terms: BriefTerms = {
      feeType: c.bid.fee_type,
      amountCents: c.bid.amount_cents,
      percentBps: c.bid.percent_bps,
      paymentTerms: paymentTermsOf(c.bid.payment_terms),
    };
    return renderAttorneyBriefPdf({
      caseTitle: c.title,
      caseCode: c.id.slice(0, 8).toUpperCase(),
      attorneyName:
        fullName(attorney?.first_name ?? null, attorney?.last_name ?? null) ??
        'Attorney',
      contact: {
        name: shown.has('name')
          ? fullName(client?.first_name ?? null, client?.last_name ?? null)
          : null,
        phone: shown.has('phone') ? (client?.phone_e164 ?? null) : null,
        email: shown.has('email') ? (client?.email ?? null) : null,
        preferredMethod: shown.has('preferred_contact')
          ? (client?.client_profile?.preferred_contact_method ?? null)
          : null,
        preferredNote: shown.has('preferred_contact')
          ? (client?.client_profile?.preferred_contact_note ?? null)
          : null,
      },
      terms,
      photos: images,
      acceptedAt: c.bid.decided_at ?? c.bid.updated_at,
      lang: attorney?.ui_language ?? null,
    });
  }
}

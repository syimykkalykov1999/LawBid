import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../../../common/errors/error-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';
import { withTxRetry } from '../../../prisma/tx-retry.util';
import type { RequestUser } from '../../auth/decorators/current-user.decorator';
import { FilesService } from '../../files/files.service';
import { CaseJournalService } from '../../journal/case-journal.service';
import { CaseWorkspaceService } from '../workspace/case-workspace.service';
import { CaseToolsSupport } from './case-tools.support';
import {
  dayText,
  elapsedMinutes,
  entryCents,
  invoiceNumber,
  totalsOf,
} from './billing.math';
import type {
  AddExpenseDto,
  AddTimeDto,
  BillingTotalsDto,
  CaseBillingDto,
  ExpenseDto,
  InvoiceDto,
  InvoiceLineDto,
  IssueInvoiceDto,
  RunningTimerDto,
  TimeEntryDto,
  UpdateTimeDto,
} from './billing.dto';
import { renderInvoicePdf, type InvoiceLine } from './invoice.pdf';

type Entry = Prisma.CaseTimeEntryGetPayload<object>;
type Expense = Prisma.CaseExpenseGetPayload<object>;

const notFound = (what: string): NotFoundException =>
  new NotFoundException({
    code: ErrorCode.NOT_FOUND,
    message: `${what} not found.`,
  });

/**
 * Owner 2026-10-20: time and expenses of a case for the attorney, and the
 * invoice document that carries them to the client. The attorney (or an
 * assistant with the "cases" duty) logs time — a timer or by hand — and
 * expenses with a receipt; "Issue invoice" freezes everything not yet
 * billed into a numbered PDF in the case's files, a line in the case chat
 * and a bell for the client. No payment: the client only reads it.
 */
@Injectable()
export class CaseBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ws: CaseWorkspaceService,
    private readonly files: FilesService,
    private readonly journal: CaseJournalService,
    private readonly support: CaseToolsSupport,
  ) {}

  /** The viewer's side of the case; billing writes are attorney-only. */
  private async attorneySide(user: RequestUser, caseId: string) {
    const s = await this.ws.side(user, caseId);
    if (s.role !== 'attorney') {
      throw new ForbiddenException({
        code: ErrorCode.FORBIDDEN,
        message: 'Only the attorney of the case can do this.',
      });
    }
    return s;
  }

  async get(user: RequestUser, caseId: string): Promise<CaseBillingDto> {
    const s = await this.ws.side(user, caseId);
    const [billing, invoices] = await Promise.all([
      this.prisma.caseBilling.findUnique({ where: { case_id: caseId } }),
      this.prisma.caseInvoice.findMany({
        where: { case_id: caseId },
        orderBy: { seq: 'desc' },
      }),
    ]);
    const invoiceDtos = await this.invoiceDtos(invoices);
    if (s.role === 'client') {
      return {
        role: 'client',
        canEdit: false,
        currency: billing?.currency ?? 'USD',
        hourlyRateCents: null,
        timer: null,
        entries: [],
        expenses: [],
        unbilled: { minutes: 0, timeCents: 0, expensesCents: 0, totalCents: 0 },
        invoices: invoiceDtos,
      };
    }
    const [entries, expenses] = await Promise.all([
      this.prisma.caseTimeEntry.findMany({
        where: { case_id: caseId, deleted_at: null },
        orderBy: [{ worked_on: 'desc' }, { created_at: 'desc' }],
        take: 500,
      }),
      this.prisma.caseExpense.findMany({
        where: { case_id: caseId, deleted_at: null },
        orderBy: [{ spent_on: 'desc' }, { created_at: 'desc' }],
        take: 500,
      }),
    ]);
    const running = entries.find((e) => e.running_since !== null) ?? null;
    return {
      role: 'attorney',
      canEdit: !user.assistant || user.assistant.duties.includes('cases'),
      currency: billing?.currency ?? 'USD',
      hourlyRateCents: billing?.hourly_rate_cents ?? null,
      timer: running ? await this.timerDto(running) : null,
      entries: entries.map((e) => this.entryDto(e)),
      expenses: await this.expenseDtos(expenses),
      unbilled: this.unbilled(entries, expenses),
      invoices: invoiceDtos,
    };
  }

  /** The attorney's running timer, on whichever case (the Mine banner). */
  async runningTimer(user: RequestUser): Promise<RunningTimerDto | null> {
    if (user.role !== 'attorney') return null;
    const e = await this.prisma.caseTimeEntry.findFirst({
      where: {
        attorney_id: user.sub,
        running_since: { not: null },
        deleted_at: null,
      },
    });
    return e ? this.timerDto(e) : null;
  }

  async setRate(
    user: RequestUser,
    caseId: string,
    hourlyRateCents: number,
  ): Promise<CaseBillingDto> {
    const s = await this.attorneySide(user, caseId);
    await this.prisma.caseBilling.upsert({
      where: { case_id: caseId },
      create: {
        case_id: caseId,
        attorney_id: s.attorneyId,
        hourly_rate_cents: hourlyRateCents,
      },
      update: { hourly_rate_cents: hourlyRateCents },
    });
    return this.get(user, caseId);
  }

  // ---- time ----------------------------------------------------------

  /** The rate a new entry is priced at: the case's, or a clear error. */
  private async rateOf(caseId: string): Promise<number> {
    const b = await this.prisma.caseBilling.findUnique({
      where: { case_id: caseId },
    });
    if (!b) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Set the hourly rate of the case first.',
        details: { field: 'hourlyRateCents' },
      });
    }
    return b.hourly_rate_cents;
  }

  async startTimer(user: RequestUser, caseId: string): Promise<CaseBillingDto> {
    const s = await this.attorneySide(user, caseId);
    const rate = await this.rateOf(caseId);
    const now = new Date();
    try {
      await this.prisma.caseTimeEntry.create({
        data: {
          case_id: caseId,
          attorney_id: s.attorneyId,
          worked_on: new Date(dayText(now)),
          minutes: 0,
          running_since: now,
          rate_cents: rate,
        },
      });
    } catch (e) {
      // The partial unique index: one running timer per attorney.
      if ((e as { code?: string }).code === 'P2002') {
        throw new ConflictException({
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A timer is already running. Stop it first.',
          details: { field: 'timer' },
        });
      }
      throw e;
    }
    return this.get(user, caseId);
  }

  async stopTimer(
    user: RequestUser,
    caseId: string,
    note?: string,
  ): Promise<CaseBillingDto> {
    const s = await this.attorneySide(user, caseId);
    const running = await this.prisma.caseTimeEntry.findFirst({
      where: {
        case_id: caseId,
        attorney_id: s.attorneyId,
        running_since: { not: null },
        deleted_at: null,
      },
    });
    if (!running?.running_since) throw notFound('Timer');
    const now = new Date();
    await this.prisma.caseTimeEntry.update({
      where: { id: running.id },
      data: {
        minutes: Math.min(
          1440,
          running.minutes + elapsedMinutes(running.running_since, now),
        ),
        running_since: null,
        ...(note ? { note } : {}),
      },
    });
    return this.get(user, caseId);
  }

  async addTime(
    user: RequestUser,
    caseId: string,
    dto: AddTimeDto,
  ): Promise<CaseBillingDto> {
    const s = await this.attorneySide(user, caseId);
    const rate = await this.rateOf(caseId);
    await this.prisma.caseTimeEntry.create({
      data: {
        case_id: caseId,
        attorney_id: s.attorneyId,
        worked_on: new Date(dto.workedOn),
        minutes: dto.minutes,
        note: dto.note ?? '',
        rate_cents: rate,
      },
    });
    return this.get(user, caseId);
  }

  /** An entry that is already on an invoice is frozen. */
  private async openEntry(caseId: string, entryId: string): Promise<Entry> {
    const e = await this.prisma.caseTimeEntry.findFirst({
      where: { id: entryId, case_id: caseId, deleted_at: null },
    });
    if (!e) throw notFound('Entry');
    if (e.invoice_id) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'This entry is already on an invoice.',
      });
    }
    return e;
  }

  async updateTime(
    user: RequestUser,
    caseId: string,
    entryId: string,
    dto: UpdateTimeDto,
  ): Promise<CaseBillingDto> {
    await this.attorneySide(user, caseId);
    const e = await this.openEntry(caseId, entryId);
    if (e.running_since) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Stop the timer before editing the entry.',
      });
    }
    await this.prisma.caseTimeEntry.update({
      where: { id: e.id },
      data: {
        ...(dto.minutes !== undefined ? { minutes: dto.minutes } : {}),
        ...(dto.workedOn ? { worked_on: new Date(dto.workedOn) } : {}),
        ...(dto.note !== undefined ? { note: dto.note } : {}),
      },
    });
    return this.get(user, caseId);
  }

  async deleteTime(
    user: RequestUser,
    caseId: string,
    entryId: string,
  ): Promise<CaseBillingDto> {
    await this.attorneySide(user, caseId);
    const e = await this.openEntry(caseId, entryId);
    await this.prisma.caseTimeEntry.update({
      where: { id: e.id },
      data: { deleted_at: new Date(), running_since: null },
    });
    return this.get(user, caseId);
  }

  // ---- expenses ------------------------------------------------------

  async addExpense(
    user: RequestUser,
    caseId: string,
    dto: AddExpenseDto,
  ): Promise<CaseBillingDto> {
    const s = await this.attorneySide(user, caseId);
    if (dto.receiptFileId) {
      await this.files.assertAttachable(user.sub, dto.receiptFileId, [
        'case_photo',
        'case_attachment',
      ]);
    }
    await this.prisma.caseExpense.create({
      data: {
        case_id: caseId,
        attorney_id: s.attorneyId,
        spent_on: new Date(dto.spentOn),
        description: dto.description,
        amount_cents: dto.amountCents,
        receipt_file_id: dto.receiptFileId ?? null,
      },
    });
    return this.get(user, caseId);
  }

  async deleteExpense(
    user: RequestUser,
    caseId: string,
    expenseId: string,
  ): Promise<CaseBillingDto> {
    await this.attorneySide(user, caseId);
    const e = await this.prisma.caseExpense.findFirst({
      where: { id: expenseId, case_id: caseId, deleted_at: null },
    });
    if (!e) throw notFound('Expense');
    if (e.invoice_id) {
      throw new ConflictException({
        code: ErrorCode.CASE_INVALID_STATE,
        message: 'This expense is already on an invoice.',
      });
    }
    await this.prisma.caseExpense.update({
      where: { id: e.id },
      data: { deleted_at: new Date() },
    });
    return this.get(user, caseId);
  }

  // ---- invoice -------------------------------------------------------

  async issueInvoice(
    user: RequestUser,
    caseId: string,
    dto: IssueInvoiceDto,
  ): Promise<CaseBillingDto> {
    const s = await this.attorneySide(user, caseId);
    const [entries, expenses, billing, kase] = await Promise.all([
      this.prisma.caseTimeEntry.findMany({
        where: {
          case_id: caseId,
          deleted_at: null,
          invoice_id: null,
          running_since: null,
          minutes: { gt: 0 },
        },
        orderBy: [{ worked_on: 'asc' }, { created_at: 'asc' }],
      }),
      this.prisma.caseExpense.findMany({
        where: { case_id: caseId, deleted_at: null, invoice_id: null },
        orderBy: [{ spent_on: 'asc' }, { created_at: 'asc' }],
      }),
      this.prisma.caseBilling.findUnique({ where: { case_id: caseId } }),
      this.prisma.case.findUniqueOrThrow({
        where: { id: caseId },
        select: { title: true },
      }),
    ]);
    if (entries.length === 0 && expenses.length === 0) {
      throw new ConflictException({
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Nothing to invoice: add time or expenses first.',
        details: { field: 'lines' },
      });
    }
    const currency = billing?.currency ?? 'USD';
    const lines: InvoiceLine[] = [
      ...entries.map((e): InvoiceLine => ({
        kind: 'time',
        date: dayText(e.worked_on),
        text: e.note || 'Legal work / Юридическая работа',
        minutes: e.minutes,
        rateCents: e.rate_cents,
        cents: entryCents(e.minutes, e.rate_cents),
      })),
      ...expenses.map((x): InvoiceLine => ({
        kind: 'expense',
        date: dayText(x.spent_on),
        text: x.description,
        cents: x.amount_cents,
      })),
    ];
    const t = totalsOf(
      entries.map((e) => ({ minutes: e.minutes, rateCents: e.rate_cents })),
      expenses.map((x) => x.amount_cents),
    );
    const names = await this.support.namesOf([s.attorneyId, s.clientId]);
    const last = await this.prisma.caseInvoice.aggregate({
      where: { case_id: caseId },
      _max: { seq: true },
    });
    const seq = (last._max.seq ?? 0) + 1;
    const number = invoiceNumber(caseId, seq);
    const now = new Date();
    const pdf = await renderInvoicePdf({
      number,
      issuedAt: now,
      caseTitle: kase.title,
      attorneyName: names.get(s.attorneyId) ?? '',
      clientName: names.get(s.clientId) ?? '',
      currency,
      lines,
      ...t,
      note: dto.note ?? null,
    });
    const file = await this.files.storeGenerated(
      s.attorneyId,
      'case_attachment',
      pdf,
      'application/pdf',
    );
    const changes = await withTxRetry(this.prisma, async (tx) => {
      const inv = await tx.caseInvoice.create({
        data: {
          case_id: caseId,
          attorney_id: s.attorneyId,
          client_id: s.clientId,
          seq,
          number,
          currency,
          minutes: t.minutes,
          time_cents: t.timeCents,
          expenses_cents: t.expensesCents,
          total_cents: t.totalCents,
          note: dto.note ?? null,
          lines: lines as unknown as Prisma.InputJsonArray,
          file_id: file.id,
        },
      });
      // Only what is still unbilled: a parallel invoice would have taken
      // the rows first, and the count below catches it.
      const a = await tx.caseTimeEntry.updateMany({
        where: { id: { in: entries.map((e) => e.id) }, invoice_id: null },
        data: { invoice_id: inv.id },
      });
      const b = await tx.caseExpense.updateMany({
        where: { id: { in: expenses.map((x) => x.id) }, invoice_id: null },
        data: { invoice_id: inv.id },
      });
      if (a.count !== entries.length || b.count !== expenses.length) {
        throw new ConflictException({
          code: ErrorCode.CASE_INVALID_STATE,
          message: 'The case changed while the invoice was made. Try again.',
        });
      }
      await this.support.linkFile(
        tx,
        caseId,
        file.id,
        s.attorneyId,
        `Invoice ${number}`,
      );
      await this.journal.append(tx, {
        caseId,
        clientId: s.clientId,
        actor: { userId: user.sub, role: 'attorney' },
        attorneyId: s.attorneyId,
        event: 'invoice_issued',
        payload: {
          invoiceId: inv.id,
          number,
          totalCents: t.totalCents,
          fileSha256: file.sha256,
        },
      });
      const chat = await this.support.chatLine(
        tx,
        caseId,
        'invoice_issued',
        String(t.totalCents),
      );
      await this.support.tell(user, s.clientId, caseId, 'invoice', tx);
      return chat;
    });
    this.support.publish(changes);
    return this.get(user, caseId);
  }

  // ---- presenting ----------------------------------------------------

  private unbilled(entries: Entry[], expenses: Expense[]): BillingTotalsDto {
    return totalsOf(
      entries
        .filter((e) => !e.invoice_id && !e.running_since)
        .map((e) => ({ minutes: e.minutes, rateCents: e.rate_cents })),
      expenses.filter((x) => !x.invoice_id).map((x) => x.amount_cents),
    );
  }

  private entryDto(e: Entry): TimeEntryDto {
    return {
      id: e.id,
      workedOn: dayText(e.worked_on),
      minutes: e.minutes,
      runningSince: e.running_since?.toISOString() ?? null,
      note: e.note,
      rateCents: e.rate_cents,
      cents: entryCents(e.minutes, e.rate_cents),
      invoiceId: e.invoice_id,
    };
  }

  private async timerDto(e: Entry): Promise<RunningTimerDto> {
    const c = await this.prisma.case.findUnique({
      where: { id: e.case_id },
      select: { title: true },
    });
    return {
      entryId: e.id,
      caseId: e.case_id,
      caseTitle: c?.title ?? '',
      startedAt: (e.running_since ?? e.created_at).toISOString(),
    };
  }

  private async expenseDtos(rows: Expense[]): Promise<ExpenseDto[]> {
    const ids = rows.flatMap((r) =>
      r.receipt_file_id ? [r.receipt_file_id] : [],
    );
    const urls = new Map(
      (await this.files.casePhotoUrls(ids)).map((u) => [u.fileId, u]),
    );
    return rows.map((r) => {
      const u = r.receipt_file_id ? urls.get(r.receipt_file_id) : undefined;
      return {
        id: r.id,
        spentOn: dayText(r.spent_on),
        description: r.description,
        amountCents: r.amount_cents,
        receiptUrl: u?.url ?? null,
        receiptPreviewUrl: u?.previewUrl ?? null,
        invoiceId: r.invoice_id,
      };
    });
  }

  private async invoiceDtos(
    rows: Prisma.CaseInvoiceGetPayload<object>[],
  ): Promise<InvoiceDto[]> {
    const urls = new Map(
      (await this.files.casePhotoUrls(rows.map((r) => r.file_id))).map((u) => [
        u.fileId,
        u.url,
      ]),
    );
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      createdAt: r.created_at.toISOString(),
      currency: r.currency,
      minutes: r.minutes,
      timeCents: r.time_cents,
      expensesCents: r.expenses_cents,
      totalCents: r.total_cents,
      note: r.note,
      lines: (r.lines as unknown as InvoiceLine[]).map((l): InvoiceLineDto => ({
        kind: l.kind,
        date: l.date,
        text: l.text,
        minutes: l.minutes ?? null,
        rateCents: l.rateCents ?? null,
        cents: l.cents,
      })),
      url: urls.get(r.file_id) ?? null,
      fileId: r.file_id,
    }));
  }
}

import { Injectable } from '@nestjs/common';
import { renderDealRecordPdf } from './deal-record.pdf';
import {
  recordCodeOf,
  snapshotSha256,
  type DealRecordSnapshot,
} from './deal-record.snapshot';
import { DealRecordTexts } from './deal-record-texts';

/** A 1x1 transparent PNG: the sample "signature" of the admin preview. */
const SAMPLE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** Admin «Запись о сделке» → «Предпросмотр PDF»: sample data, live texts. */
@Injectable()
export class DealRecordPreview {
  constructor(private readonly texts: DealRecordTexts) {}

  async sample(): Promise<Buffer> {
    const texts = await this.texts.pdf();
    const snapshot: DealRecordSnapshot = {
      version: 1,
      recordId: '00000000-0000-4000-8000-000000000001',
      case: {
        id: '00000000-0000-4000-8000-000000000002',
        title: 'Sample case — Lease dispute (пример, мисал)',
        practice: 'Real estate',
        states: ['NY'],
      },
      client: {
        id: 'c',
        fullName: 'Sample Client',
        email: 'client@example.com',
        username: 'sample_client',
      },
      attorney: {
        id: 'a',
        fullName: 'Sample Attorney',
        email: 'attorney@example.com',
        username: 'sample_attorney',
        barState: 'NY',
        barNumber: '0000000',
        firmName: 'Sample & Partners',
      },
      acceptedBy: 'client',
      acceptedAt: '2026-10-27T19:40:00.000Z',
      terms: {
        feeType: 'fixed',
        amountCents: 240_000,
        percentBps: null,
        paymentTerms: {
          version: 1,
          type: 'retainer_plus_installments',
          currency: 'USD',
          retainerCents: 100_000,
          installmentCents: 70_000,
          installmentCount: 2,
          installmentPeriod: 'monthly',
          notes: 'Court filing fees are paid by the client at cost.',
        },
      },
      history: [
        {
          roundNo: 0,
          fromRole: 'attorney',
          createdAt: '2026-10-25T14:02:00.000Z',
          feeType: 'fixed',
          amountCents: 250_000,
          percentBps: null,
          paymentTerms: null,
          message:
            'I can take this on for a flat fee. Retainer first, the rest in two monthly payments.',
          status: 'countered',
        },
        {
          roundNo: 1,
          fromRole: 'client',
          createdAt: '2026-10-25T18:30:00.000Z',
          feeType: 'fixed',
          amountCents: 240_000,
          percentBps: null,
          paymentTerms: null,
          message: 'Could you do 2,400? Спасибо.',
          status: 'countered',
        },
        {
          roundNo: 2,
          fromRole: 'attorney',
          createdAt: '2026-10-27T19:40:00.000Z',
          feeType: 'fixed',
          amountCents: 240_000,
          percentBps: null,
          paymentTerms: null,
          message: 'Agreed.',
          status: 'accepted',
        },
      ],
      texts: {
        notContract: texts.notContract,
        footer: texts.footer,
        textVersion: texts.textVersion,
      },
    };
    const sha = snapshotSha256(snapshot);
    return renderDealRecordPdf({
      snapshot,
      recordCode: recordCodeOf(snapshot.recordId, sha),
      snapshotSha256: sha,
      title: texts.title,
      generatedAt: new Date('2026-10-27T20:02:00.000Z'),
      signatures: [
        {
          role: 'client',
          name: 'Sample Client',
          image: SAMPLE_PNG,
          signedAt: new Date('2026-10-27T19:41:00.000Z'),
          ip: '203.0.113.10',
        },
        {
          role: 'attorney',
          name: 'Sample Attorney',
          image: SAMPLE_PNG,
          signedAt: new Date('2026-10-27T20:02:00.000Z'),
          ip: '203.0.113.20',
        },
      ],
    });
  }
}

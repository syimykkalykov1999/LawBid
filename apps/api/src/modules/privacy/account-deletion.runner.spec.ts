import type { ConfigService } from '@nestjs/config';
import type { PinoLogger } from 'nestjs-pino';
import { AccountAnonymizationService } from './account-anonymization.service';
import {
  AccountDeletionRunner,
  deletionJobId,
} from './account-deletion.runner';
import { ANONYMIZED_FILE_PURPOSES } from './privacy.constants';

const logger = {
  setContext: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
} as unknown as PinoLogger;

describe('AccountDeletionRunner (owner 2026-10-22, audit #4 §5)', () => {
  it('one job id per account and UTC day', () => {
    const d = new Date('2026-10-22T03:00:00Z');
    expect(deletionJobId('u1', d)).toBe('anonymize-u1-20261022');
    expect(deletionJobId('u1', new Date('2026-10-23T00:00:01Z'))).toBe(
      'anonymize-u1-20261023',
    );
  });

  it('without Redis the tick runs the anonymization inline', async () => {
    const anonymizeDue = jest.fn(() =>
      Promise.resolve({ anonymized: ['u1'], failed: [] }),
    );
    const runner = new AccountDeletionRunner(
      { mode: 'worker' },
      { get: () => undefined } as unknown as ConfigService,
      { anonymizeDue } as unknown as AccountAnonymizationService,
      logger,
    );
    runner.onApplicationBootstrap();
    expect(await runner.scheduleDue()).toEqual({
      anonymized: ['u1'],
      failed: [],
    });
    expect(anonymizeDue).toHaveBeenCalledTimes(1);
  });

  it('every content purpose is released (GDPR Art. 17)', () => {
    expect([...ANONYMIZED_FILE_PURPOSES]).toEqual(
      expect.arrayContaining([
        'post_image',
        'post_video',
        'post_attachment',
        'case_photo',
        'case_attachment',
        'review_photo',
        'support_attachment',
        'avatar',
        'chat_voice',
        'chat_attachment',
      ]),
    );
    expect(ANONYMIZED_FILE_PURPOSES).not.toContain('document_template');
  });
});

describe('AccountAnonymizationService legal hold', () => {
  it('a person under a legal hold is not anonymized yet', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn(() =>
          Promise.resolve({
            id: 'u1',
            role: 'client',
            status: 'deletion_pending',
            anonymized_at: null,
            avatar_file_id: null,
            subscription: null,
          }),
        ),
      },
      legalHold: { findFirst: jest.fn(() => Promise.resolve({ id: 'h1' })) },
      file: { findMany: jest.fn() },
    };
    const payments = { deleteCustomer: jest.fn(), cancelNow: jest.fn() };
    const svc = new AccountAnonymizationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      payments as never,
      {} as never,
      logger,
    );
    expect(await svc.anonymize('u1')).toBe(false);
    expect(payments.deleteCustomer).not.toHaveBeenCalled();
    expect(prisma.file.findMany).not.toHaveBeenCalled();
  });
});

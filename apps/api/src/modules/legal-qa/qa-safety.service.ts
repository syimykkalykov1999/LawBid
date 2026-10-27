import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { PrismaService } from '../../prisma/prisma.service';
import {
  detectPii,
  kindsOf,
  parseKinds,
  redactPii,
  type PiiKind,
} from './qa-pii';
import { contentHash, countLinks, looksLikeIndividualAdvice } from './qa-spam';

export type PiiMode = 'off' | 'warn' | 'redact' | 'block';
export type AdviceMode = 'off' | 'flag' | 'hold';

export interface Screened {
  /** The text to store (private info redacted in `redact` mode). */
  texts: string[];
  /** Flags to store on the row (kinds of private info, advice ...). */
  flags: string[];
  /** Private-info kinds found (for the response in `warn` mode). */
  warnings: PiiKind[];
  hash: string;
  /** Answer only: keep it hidden until a moderator restores it. */
  hold: boolean;
}

const DAY_MS = 24 * 3600 * 1000;

/**
 * Owner 2026-10-28 (legal safety): what happens to a question or answer
 * before it is published. Everything is tuned in the admin («qa.*»):
 *  1. new-account cooldown, too many links, the same text again (spam);
 *  2. private info and confidential case details (SSN, address, case
 *     number, opposing party ...): off / warn / redact / block;
 *  3. an answer that reads as individualized advice from someone who is
 *     not licensed in the question's state is flagged or held (unauthorized
 *     practice of law).
 */
@Injectable()
export class QaSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AppSettingsService,
  ) {}

  async screenQuestion(
    userId: string,
    title: string,
    body: string,
  ): Promise<Screened> {
    await this.assertAccountOldEnough(userId);
    await this.assertLinks(`${title}\n${body}`);
    const pii = await this.screenPii([title, body]);
    const hash = contentHash(title, body);
    await this.assertNotDuplicateQuestion(userId, hash);
    return {
      texts: pii.texts,
      flags: pii.kinds,
      warnings: pii.kinds,
      hash,
      hold: false,
    };
  }

  async screenAnswer(
    attorneyId: string,
    questionId: string,
    stateCode: string | null,
    body: string,
    verified: boolean,
  ): Promise<Screened> {
    await this.assertLinks(body);
    const pii = await this.screenPii([body]);
    const hash = contentHash(body);
    await this.assertNotCopyPastedAnswer(attorneyId, questionId, hash);
    const flags: string[] = [...pii.kinds];
    let hold = false;
    const mode = (await this.settings.string(
      'qa.advice_flag_mode',
    )) as AdviceMode;
    if (mode !== 'off') {
      const licensed =
        verified && (await this.licensedIn(attorneyId, stateCode));
      if (stateCode && !licensed) flags.push('state_not_licensed');
      if (!licensed && looksLikeIndividualAdvice(pii.texts[0])) {
        flags.push('individualized_advice');
        hold = mode === 'hold';
      }
    }
    return {
      texts: pii.texts,
      flags: [...new Set(flags)],
      warnings: pii.kinds,
      hash,
      hold,
    };
  }

  // --- spam ----------------------------------------------------------------

  private async assertAccountOldEnough(userId: string): Promise<void> {
    const hours = await this.settings.number('qa.new_account_cooldown_hours');
    if (hours <= 0) return;
    const u = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { created_at: true },
    });
    if (!u) return;
    const left = u.created_at.getTime() + hours * 3600 * 1000 - Date.now();
    if (left > 0) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'A new account can ask a public question a little later.',
          details: {
            action: 'new_account_cooldown',
            retryAfterSeconds: Math.ceil(left / 1000),
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async assertLinks(text: string): Promise<void> {
    const max = await this.settings.number('qa.max_links');
    if (countLinks(text) > max) {
      throw this.invalid('too_many_links', 'Too many links.');
    }
  }

  private async windowStart(): Promise<Date | null> {
    const days = await this.settings.number('qa.duplicate_window_days');
    return days > 0 ? new Date(Date.now() - days * DAY_MS) : null;
  }

  private async assertNotDuplicateQuestion(
    userId: string,
    hash: string,
  ): Promise<void> {
    const since = await this.windowStart();
    if (!since) return;
    const mine = await this.prisma.legalQuestion.count({
      where: {
        author_id: userId,
        content_hash: hash,
        created_at: { gte: since },
      },
    });
    if (mine > 0) {
      throw this.invalid('duplicate', 'You already asked this question.');
    }
    const max = await this.settings.number('qa.duplicate_cross_user_max');
    const others = await this.prisma.legalQuestion.findMany({
      where: { content_hash: hash, created_at: { gte: since } },
      select: { author_id: true },
      distinct: ['author_id'],
      take: max,
    });
    if (others.length >= max) {
      throw this.invalid('duplicate', 'This text was posted many times.');
    }
  }

  private async assertNotCopyPastedAnswer(
    attorneyId: string,
    questionId: string,
    hash: string,
  ): Promise<void> {
    const since = await this.windowStart();
    if (!since) return;
    const max = await this.settings.number('qa.answer_duplicate_max');
    const same = await this.prisma.legalAnswer.count({
      where: {
        attorney_id: attorneyId,
        content_hash: hash,
        question_id: { not: questionId },
        created_at: { gte: since },
      },
    });
    if (same >= max) {
      throw this.invalid(
        'duplicate',
        'The same answer was posted too many times.',
      );
    }
  }

  // --- private info ----------------------------------------------------------

  private async screenPii(
    texts: string[],
  ): Promise<{ texts: string[]; kinds: PiiKind[] }> {
    const mode = (await this.settings.string('qa.pii_mode')) as PiiMode;
    if (mode === 'off') return { texts, kinds: [] };
    const kinds = parseKinds(await this.settings.string('qa.pii_kinds'));
    const found = texts.map((t) => detectPii(t, kinds));
    const seen = [...new Set(found.flatMap((f) => kindsOf(f)))];
    if (seen.length === 0) return { texts, kinds: [] };
    if (mode === 'block') {
      throw new BadRequestException({
        code: ErrorCode.VALIDATION_ERROR,
        message:
          'Please remove private details (such as an SSN, address, case number or the other side’s name): this question is public.',
        details: { reason: 'private_info', kinds: seen },
      });
    }
    return {
      texts:
        mode === 'redact' ? texts.map((t, i) => redactPii(t, found[i])) : texts,
      kinds: seen,
    };
  }

  // --- licence ---------------------------------------------------------------

  private async licensedIn(
    attorneyId: string,
    stateCode: string | null,
  ): Promise<boolean> {
    if (!stateCode) return true;
    const n = await this.prisma.attorneyLicense.count({
      where: {
        attorney_id: attorneyId,
        state_code: stateCode,
        license_status: 'verified',
      },
    });
    return n > 0;
  }

  private invalid(reason: string, message: string): BadRequestException {
    return new BadRequestException({
      code: ErrorCode.VALIDATION_ERROR,
      message,
      details: { reason },
    });
  }
}

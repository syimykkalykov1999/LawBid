import { UnprocessableEntityException } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import type {
  ContentModerationHook,
  ModerationContext,
  ModerationVerdict,
} from './content-moderation.hook';

/**
 * Feature reality audit 2026-11-08: the admin's blocked / hold words, link
 * and repeat rules and the AI text check (moderation.*) held only posts and
 * comments; Q&A, reviews and channel posts now run the same hook. «block» is
 * refused here exactly like a post (422 CONTENT_BLOCKED); «hold» is returned
 * so the caller saves the text hidden and files it for the moderators.
 * No hook (a process without the moderation module) or no text = allow.
 */
export async function screenContent(
  hook: ContentModerationHook | undefined,
  text: string | null | undefined,
  context: ModerationContext,
): Promise<ModerationVerdict> {
  if (!hook || !text?.trim()) return 'allow';
  const verdict = await hook.check(text, context);
  if (verdict === 'block') {
    throw new UnprocessableEntityException({
      code: ErrorCode.CONTENT_BLOCKED,
      message: 'This content cannot be published.',
    });
  }
  return verdict;
}

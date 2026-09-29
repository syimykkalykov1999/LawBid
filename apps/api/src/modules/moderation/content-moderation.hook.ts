import { Injectable } from '@nestjs/common';

/** docs/05 §12.2: result of the pre-publication check. */
export type ModerationVerdict = 'allow' | 'hold' | 'block';

export interface ModerationContext {
  kind: 'post' | 'comment';
  authorId: string;
}

/** docs/05 §12.2 `ContentModerationHook.check(content, context)`. */
export interface ContentModerationHook {
  check(
    content: string,
    context: ModerationContext,
  ): Promise<ModerationVerdict>;
}

export const CONTENT_MODERATION_HOOK = Symbol('CONTENT_MODERATION_HOOK');

/** Stub for file 05 (§12.2: "на этом этапе реализация возвращает allow").
 * TODO(docs/06 moderation): replace with the real implementation. */
@Injectable()
export class AllowAllModerationHook implements ContentModerationHook {
  check(): Promise<ModerationVerdict> {
    return Promise.resolve('allow');
  }
}

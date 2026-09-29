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

/** docs/05 §12.2: result of the pre-publication check. */
export type ModerationVerdict = 'allow' | 'hold' | 'block';

export interface ModerationContext {
  kind: 'post' | 'comment';
  authorId: string;
}

/** docs/05 §12.2 `ContentModerationHook.check(content, context)`. */
export interface ContentModerationHook {
  /** Read-only: the verdict for [content]. Never records anything (algo
   * audit 2026-10-27, CONTENT C-3: a retry after an error or an edit must
   * not make the text its own "repeat"). */
  check(
    content: string,
    context: ModerationContext,
  ): Promise<ModerationVerdict>;
  /** Called once the object was really created: remembers the text for
   * the "repeated text from one author" rule. Optional for other hooks. */
  record?(content: string, context: ModerationContext): Promise<void>;
}

export const CONTENT_MODERATION_HOOK = Symbol('CONTENT_MODERATION_HOOK');

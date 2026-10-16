/// Owner 2026-10-15: how many characters each free-text field takes. The
/// numbers are the admin's (Config → «Лимиты ввода»), served in the public
/// bootstrap and enforced by the server; the starter values below are what
/// the app uses before the first answer and what the admin panel starts
/// with. A field stops at [TextLimits.of] and shows `n/limit` under it.
enum TextLimit {
  chatMessage('limits.chat_message_chars', 2000),
  comment('limits.comment_chars', 1000),
  postBrief('post.max_chars_brief', 3000),
  postMedia('post.max_chars_media', 2200),
  postTitle('limits.post_title_chars', 120),
  caseTitle('limits.case_title_chars', 120),
  caseDescription('limits.case_description_chars', 5000),
  bidMessage('limits.bid_message_chars', 2000),
  counterMessage('limits.counter_message_chars', 500),
  review('limits.review_chars', 1000),
  dispute('limits.dispute_chars', 1000),
  workspaceNote('limits.workspace_note_chars', 1000),
  workspaceUpdate('limits.workspace_update_chars', 5000),
  supportMessage('limits.support_message_chars', 5000),
  bio('limits.bio_chars', 300);

  const TextLimit(this.key, this.fallback);

  final String key;
  final int fallback;
}

abstract final class TextLimits {
  static Map<String, int> _server = const {};

  /// Called with the `app_config` of every bootstrap answer.
  static void apply(Map<String, String> appConfig) {
    final next = <String, int>{};
    for (final l in TextLimit.values) {
      final v = int.tryParse(appConfig[l.key] ?? '');
      if (v != null && v > 0) next[l.key] = v;
    }
    _server = next;
  }

  /// The current limit of [l] (the admin's, else the starter value).
  static int of(TextLimit l) => _server[l.key] ?? l.fallback;
}

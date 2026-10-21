/// Owner 2026-10-21 (inbox 26b/26c, Telegram): the reactions of channels and
/// groups. «All» = this palette, «Selected» = what the admins ticked,
/// «Off» = none. Mirrors apps/api/src/common/reactions/reaction-palette.ts.
const List<String> kReactionPalette = [
  '👍',
  '❤️',
  '🔥',
  '👏',
  '😮',
  '🙏',
  '👎',
  '😁',
  '🤔',
  '🤯',
  '😢',
  '🎉',
  '🤩',
  '👌',
  '😍',
  '💯',
  '🤣',
  '⚡',
  '🏆',
  '💔',
  '👀',
  '🤝',
  '✍️',
  '😎',
];

/// All / selected / off.
enum ReactionsMode {
  all,
  some,
  off;

  /// The server's value (`all` | `some` | `off`), unknown = [all].
  static ReactionsMode parse(String? json) => switch (json) {
        'some' => some,
        'off' => off,
        _ => all,
      };
}

/// The emojis a reader may put under [mode] / [allowed], palette order.
List<String> reactionChoices(ReactionsMode mode, List<String> allowed) =>
    switch (mode) {
      ReactionsMode.off => const [],
      ReactionsMode.some => [
          for (final e in kReactionPalette)
            if (allowed.contains(e)) e,
        ],
      ReactionsMode.all => kReactionPalette,
    };

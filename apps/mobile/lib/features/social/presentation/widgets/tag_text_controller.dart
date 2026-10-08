import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// #hashtags and @mentions as the feed card links them.
final postTagPattern =
    RegExp(r'(#[\p{L}\p{N}_]+|@[A-Za-z0-9._]+)', unicode: true);

/// Owner 2026-10-08: a composer field where #hashtags and @mentions show
/// in gold while typing — they become links once published.
class TagTextController extends TextEditingController {
  TagTextController({super.text});

  @override
  TextSpan buildTextSpan({
    required BuildContext context,
    required bool withComposing,
    TextStyle? style,
  }) {
    final colors = Theme.of(context).extension<AppColorTokens>();
    final s = text;
    if (colors == null || s.isEmpty) {
      return super.buildTextSpan(
        context: context,
        style: style,
        withComposing: withComposing,
      );
    }
    final tag = (style ?? const TextStyle()).copyWith(
      color: colors.goldDark,
      fontWeight: FontWeight.w600,
    );
    final spans = <InlineSpan>[];
    var at = 0;
    for (final m in postTagPattern.allMatches(s)) {
      if (m.start > at) spans.add(TextSpan(text: s.substring(at, m.start)));
      spans.add(TextSpan(text: m.group(0), style: tag));
      at = m.end;
    }
    if (at < s.length) spans.add(TextSpan(text: s.substring(at)));
    return TextSpan(style: style, children: spans);
  }
}

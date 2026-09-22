import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';

import '../../theme/app_color_tokens.dart';
import '../../theme/app_typography_tokens.dart';

/// Centered secondary legal copy with tappable links (file 07 §4
/// "Юридический текст"). Used for the welcome screen's disclaimer and the
/// phone screen's terms caption (stage 1.7) — the text itself comes from
/// translation keys (file 07 §8), never hardcoded here.
///
/// [links] maps an exact substring of [text] (e.g. "Условия") to the
/// callback fired when it's tapped; every occurrence found is made
/// interactive and rendered in `gold`, everything else in [style] (defaults
/// to `caption`/`textSecondary`).
class LegalText extends StatelessWidget {
  const LegalText({
    super.key,
    required this.text,
    this.links = const {},
    this.style,
  });

  final String text;
  final Map<String, VoidCallback> links;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final baseStyle = (style ?? typography.caption).copyWith(color: colors.textSecondary);
    final linkStyle = baseStyle.copyWith(color: colors.gold, decoration: TextDecoration.underline);

    final spans = <InlineSpan>[];
    if (links.isEmpty) {
      spans.add(TextSpan(text: text, style: baseStyle));
    } else {
      // Find every link substring in order of first appearance and split
      // `text` around them, left to right.
      final matches = <MapEntry<int, MapEntry<String, VoidCallback>>>[];
      for (final entry in links.entries) {
        final index = text.indexOf(entry.key);
        if (index >= 0) matches.add(MapEntry(index, entry));
      }
      matches.sort((a, b) => a.key.compareTo(b.key));

      var cursor = 0;
      for (final match in matches) {
        final start = match.key;
        if (start < cursor) continue; // overlapping match, skip
        if (start > cursor) {
          spans.add(TextSpan(text: text.substring(cursor, start), style: baseStyle));
        }
        final label = match.value.key;
        spans.add(
          TextSpan(
            text: label,
            style: linkStyle,
            recognizer: TapGestureRecognizer()..onTap = match.value.value,
          ),
        );
        cursor = start + label.length;
      }
      if (cursor < text.length) {
        spans.add(TextSpan(text: text.substring(cursor), style: baseStyle));
      }
    }

    return Text.rich(TextSpan(children: spans), textAlign: TextAlign.center);
  }
}

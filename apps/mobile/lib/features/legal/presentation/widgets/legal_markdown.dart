import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:url_launcher/url_launcher.dart';

/// One block of a legal document in Markdown.
@immutable
class LegalBlock {
  const LegalBlock(this.kind, this.text, {this.level = 0});

  /// `h` (a heading), `li` (a list item) or `p` (a paragraph).
  final String kind;
  final String text;

  /// Heading depth (1-3) or list nesting (0, 1).
  final int level;
}

/// The Markdown the owner writes in the admin: `#`/`##`/`###` headings,
/// `-` lists (one nested level), paragraphs, `**bold**`, `*italic*` and
/// `[links](https://…)`. Nothing else is interpreted.
List<LegalBlock> parseLegalMarkdown(String md) {
  final blocks = <LegalBlock>[];
  final para = <String>[];
  void flush() {
    if (para.isEmpty) return;
    blocks.add(LegalBlock('p', para.join(' ')));
    para.clear();
  }

  for (final raw in md.replaceAll('\r\n', '\n').split('\n')) {
    final line = raw.trimRight();
    if (line.trim().isEmpty) {
      flush();
      continue;
    }
    final heading = RegExp(r'^(#{1,6})\s+(.*)$').firstMatch(line);
    if (heading != null) {
      flush();
      blocks.add(
        LegalBlock(
          'h',
          heading.group(2)!.trim(),
          level: heading.group(1)!.length.clamp(1, 3),
        ),
      );
      continue;
    }
    final item = RegExp(r'^(\s*)(?:[-*]|\d+\.)\s+(.*)$').firstMatch(line);
    if (item != null) {
      flush();
      blocks.add(
        LegalBlock(
          'li',
          item.group(2)!.trim(),
          level: item.group(1)!.length >= 2 ? 1 : 0,
        ),
      );
      continue;
    }
    para.add(line.trim());
  }
  flush();
  return blocks;
}

/// Renders [parseLegalMarkdown] with the app's typography. Text is
/// selectable and wraps; links open in the browser.
class LegalMarkdown extends StatelessWidget {
  const LegalMarkdown(this.markdown, {super.key});

  final String markdown;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final blocks = parseLegalMarkdown(markdown);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final b in blocks)
          switch (b.kind) {
            'h' => Padding(
                padding: EdgeInsets.only(
                  top: b.level == 1 ? 0 : AppSpacing.md,
                  bottom: AppSpacing.sm,
                ),
                child: Semantics(
                  header: true,
                  child: Text(
                    stripInline(b.text),
                    style: (b.level == 1 ? type.titleLarge : type.titleMedium)
                        .copyWith(color: colors.text),
                  ),
                ),
              ),
            'li' => Padding(
                padding: EdgeInsets.only(
                  bottom: AppSpacing.sm,
                  left: b.level * AppSpacing.lg,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '• ',
                      style: type.body.copyWith(color: colors.textSecondary),
                    ),
                    Expanded(child: _InlineText(b.text)),
                  ],
                ),
              ),
            _ => Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.md),
                child: _InlineText(b.text),
              ),
          },
      ],
    );
  }
}

final _inline = RegExp(r'\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)\s]+)\)');

/// Plain text of an inline Markdown string (markers removed).
String stripInline(String s) => s.replaceAllMapped(
      _inline,
      (m) => m.group(1) ?? m.group(2) ?? m.group(3) ?? '',
    );

class _InlineText extends StatefulWidget {
  const _InlineText(this.text);

  final String text;

  @override
  State<_InlineText> createState() => _InlineTextState();
}

class _InlineTextState extends State<_InlineText> {
  final List<TapGestureRecognizer> _taps = [];

  @override
  void dispose() {
    for (final t in _taps) {
      t.dispose();
    }
    super.dispose();
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Object {
      // Nothing to open the link with; the text stays readable.
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final base = type.body.copyWith(color: colors.text, height: 1.4);
    for (final t in _taps) {
      t.dispose();
    }
    _taps.clear();
    final spans = <InlineSpan>[];
    var last = 0;
    for (final m in _inline.allMatches(widget.text)) {
      if (m.start > last) {
        spans.add(TextSpan(text: widget.text.substring(last, m.start)));
      }
      if (m.group(1) != null) {
        spans.add(
          TextSpan(
            text: m.group(1),
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        );
      } else if (m.group(2) != null) {
        spans.add(
          TextSpan(
            text: m.group(2),
            style: const TextStyle(fontStyle: FontStyle.italic),
          ),
        );
      } else {
        final url = m.group(4)!;
        final tap = TapGestureRecognizer()..onTap = () => _open(url);
        _taps.add(tap);
        spans.add(
          TextSpan(
            text: m.group(3),
            recognizer: tap,
            style: TextStyle(
              color: colors.goldDark,
              decoration: TextDecoration.underline,
            ),
          ),
        );
      }
      last = m.end;
    }
    if (last < widget.text.length) {
      spans.add(TextSpan(text: widget.text.substring(last)));
    }
    return Text.rich(TextSpan(style: base, children: spans));
  }
}

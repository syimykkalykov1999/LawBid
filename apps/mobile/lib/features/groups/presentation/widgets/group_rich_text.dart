import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:url_launcher/url_launcher.dart';

/// A message's text with tappable links and highlighted @mentions.
/// [mentions] are the people the message mentions; «@Name» in the text is
/// matched by their display name (what the mention picker inserts).
class GroupRichText extends StatefulWidget {
  const GroupRichText({
    required this.text,
    required this.style,
    required this.linkColor,
    required this.mentionColor,
    this.mentions = const [],
    this.onMention,
    super.key,
  });

  final String text;
  final TextStyle style;
  final Color linkColor;
  final Color mentionColor;
  final List<api.GroupPersonDto> mentions;

  /// A tap on a mention.
  final void Function(api.GroupPersonDto person)? onMention;

  @override
  State<GroupRichText> createState() => _GroupRichTextState();
}

class _GroupRichTextState extends State<GroupRichText> {
  final List<TapGestureRecognizer> _recognizers = [];
  List<InlineSpan> _spans = const [];

  @override
  void initState() {
    super.initState();
    _build();
  }

  @override
  void didUpdateWidget(GroupRichText old) {
    super.didUpdateWidget(old);
    if (old.text != widget.text ||
        old.style != widget.style ||
        old.linkColor != widget.linkColor ||
        old.mentionColor != widget.mentionColor ||
        old.mentions != widget.mentions) {
      _build();
    }
  }

  @override
  void dispose() {
    _clear();
    super.dispose();
  }

  void _clear() {
    for (final r in _recognizers) {
      r.dispose();
    }
    _recognizers.clear();
  }

  TapGestureRecognizer _tap(VoidCallback onTap) {
    final r = TapGestureRecognizer()..onTap = onTap;
    _recognizers.add(r);
    return r;
  }

  static const _trailing = '.,;:!?)»”\'"';

  void _build() {
    _clear();
    final text = widget.text;
    final byName = <String, api.GroupPersonDto>{};
    for (final p in widget.mentions) {
      final n = p.displayName?.trim();
      if (n != null && n.isNotEmpty) byName['@$n'] = p;
    }
    final names = byName.keys.toList()
      ..sort((a, b) => b.length.compareTo(a.length));
    final pattern = RegExp(
      r'(https?://[^\s<>]+|www\.[^\s<>]+)'
      '${names.isEmpty ? '' : '|(${names.map(RegExp.escape).join('|')})'}',
      caseSensitive: false,
    );
    final spans = <InlineSpan>[];
    var at = 0;
    for (final m in pattern.allMatches(text)) {
      var end = m.end;
      final url = m.group(1);
      if (url != null) {
        while (end > m.start + 1 && _trailing.contains(text[end - 1])) {
          end--;
        }
      }
      if (m.start > at) spans.add(TextSpan(text: text.substring(at, m.start)));
      final piece = text.substring(m.start, end);
      if (url != null) {
        final uri = Uri.tryParse(
          piece.toLowerCase().startsWith('www.') ? 'https://$piece' : piece,
        );
        spans.add(
          TextSpan(
            text: piece,
            style: TextStyle(
              color: widget.linkColor,
              decoration: TextDecoration.underline,
              decorationColor: widget.linkColor,
            ),
            recognizer: uri == null
                ? null
                : _tap(
                    () => launchUrl(uri, mode: LaunchMode.externalApplication),
                  ),
          ),
        );
      } else {
        final person = byName[piece];
        final onMention = widget.onMention;
        spans.add(
          TextSpan(
            text: piece,
            style: TextStyle(
              color: widget.mentionColor,
              fontWeight: FontWeight.w600,
            ),
            recognizer: person == null || onMention == null
                ? null
                : _tap(() => onMention(person)),
          ),
        );
      }
      at = end;
    }
    if (at < text.length) spans.add(TextSpan(text: text.substring(at)));
    _spans = spans;
  }

  @override
  Widget build(BuildContext context) =>
      Text.rich(TextSpan(children: _spans), style: widget.style);
}

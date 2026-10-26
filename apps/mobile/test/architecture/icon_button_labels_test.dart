import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-22 (checklist §17, VoiceOver / TalkBack): an icon-only
/// button must say what it does. The design-system buttons
/// (`AppIconButton`, `GavelStrikeIconButton`, `AppBackButton`) require a
/// `semanticLabel`; a raw Material `IconButton` needs `tooltip:` and a
/// `FloatingActionButton` a `tooltip:` or an enclosing `Semantics(label:)`.
/// Every file under lib/ is checked, so the ten main screens (feed, search,
/// mine, profile, settings, chats, conversation, attorney profile, case,
/// call) and all the rest stay covered.
void main() {
  /// The text of the call that opens at [start] (to its closing bracket).
  String call(String src, int start) {
    var depth = 0;
    for (var i = src.indexOf('(', start); i < src.length; i++) {
      final c = src[i];
      if (c == '(') depth++;
      if (c == ')' && --depth == 0) return src.substring(start, i + 1);
    }
    return src.substring(start);
  }

  test('every IconButton has a tooltip, every FAB a label', () {
    final bad = <String>[];
    final iconButton = RegExp(r'(?<![A-Za-z_.])IconButton\(');
    final fab = RegExp(r'(?<![A-Za-z_.])FloatingActionButton(\.extended)?\(');
    for (final f
        in Directory('lib').listSync(recursive: true).whereType<File>()) {
      final path = f.path.replaceAll(r'\', '/');
      if (!path.endsWith('.dart') || path.endsWith('.g.dart')) continue;
      final src = f.readAsStringSync();
      int line(int i) => '\n'.allMatches(src.substring(0, i)).length + 1;
      for (final m in iconButton.allMatches(src)) {
        // A class declaration or a doc comment, not a call.
        final before = src.substring(0, m.start);
        final lineStart = before.lastIndexOf('\n') + 1;
        final prefix = before.substring(lineStart).trimLeft();
        if (prefix.startsWith('///') || prefix.startsWith('class ')) continue;
        if (!call(src, m.start).contains('tooltip:')) {
          bad.add('$path:${line(m.start)} IconButton without tooltip');
        }
      }
      for (final m in fab.allMatches(src)) {
        final body = call(src, m.start);
        final wrapped = src
            .substring((m.start - 400).clamp(0, src.length), m.start)
            .contains('Semantics(');
        if (!body.contains('tooltip:') && !wrapped) {
          bad.add('$path:${line(m.start)} FloatingActionButton without label');
        }
      }
    }
    expect(bad, isEmpty, reason: bad.join('\n'));
  });
}

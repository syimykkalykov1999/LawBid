import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-10-22 (audit #4 §4): Arabic, Hebrew, Persian and Urdu read
/// right to left, so paddings, badges and alignments say start/end, never
/// left/right. Only real geometry (a touch point, a video trim range, a
/// sticker position, a drag-around window, the browser's safe area) may use
/// physical sides; those files are listed below.
const _geometryFiles = {
  'lib/core/platform/web_safe_area_web.dart',
  // A diagonal gradient (decoration).
  'lib/core/design_system/widgets/display/brand_pattern.dart',
  'lib/core/design_system/widgets/buttons/gavel_strike_button.dart',
  'lib/core/design_system/widgets/performance/text_warm_up.dart',
  'lib/features/calls/presentation/call_pip_window.dart',
  'lib/features/chat/presentation/chat_album.dart',
  'lib/features/cases/presentation/widgets/case_cover.dart',
  'lib/features/reels/presentation/video_editor_screen.dart',
  'lib/features/stories/presentation/story_frame.dart',
};

/// The text of the call that opens at [start] (up to its closing bracket).
String _call(String src, int start) {
  var depth = 0;
  for (var i = src.indexOf('(', start); i < src.length; i++) {
    final c = src[i];
    if (c == '(') depth++;
    if (c == ')' && --depth == 0) return src.substring(start, i + 1);
  }
  return src.substring(start);
}

/// Both sides are present and equal (a centred box is not one-sided).
bool _same(String body, String a, String b) {
  String? v(String k) =>
      RegExp('\\b$k:\\s*([^,)]+)').firstMatch(body)?.group(1)?.trim();
  final x = v(a);
  return x != null && x == v(b);
}

void main() {
  test('layouts use start/end instead of left/right', () {
    final bad = <String>[];
    final side = RegExp(r'(^|[(,\s])(left|right):');
    final corner = RegExp(r'\b(topLeft|topRight|bottomLeft|bottomRight):');
    final align = RegExp(
      r'Alignment\.(centerLeft|centerRight|topLeft|topRight|bottomLeft|bottomRight)',
    );
    for (final f
        in Directory('lib').listSync(recursive: true).whereType<File>()) {
      final path = f.path.replaceAll(r'\', '/');
      if (!path.endsWith('.dart') ||
          path.endsWith('.g.dart') ||
          path.endsWith('.freezed.dart') ||
          _geometryFiles.contains(path)) {
        continue;
      }
      final src = f.readAsStringSync();
      int line(int i) => '\n'.allMatches(src.substring(0, i)).length + 1;
      for (final name in [
        'EdgeInsets.only(',
        'Positioned(',
        'BorderRadius.only(',
      ]) {
        for (final m in RegExp(RegExp.escape(name)).allMatches(src)) {
          if (name == 'Positioned(' &&
              m.start > 0 &&
              RegExp(r'\w').hasMatch(src[m.start - 1])) {
            continue;
          }
          final body = _call(src, m.start);
          final hit = name == 'BorderRadius.only('
              ? corner.hasMatch(body) &&
                  !(_same(body, 'topLeft', 'topRight') &&
                      _same(body, 'bottomLeft', 'bottomRight'))
              : side.hasMatch(body) && !_same(body, 'left', 'right');
          if (hit) bad.add('$path:${line(m.start)} $name');
        }
      }
      for (final m in align.allMatches(src)) {
        // Gradients are decoration, not layout.
        final lineStart = src.lastIndexOf('\n', m.start) + 1;
        final prefix = src.substring(lineStart, m.start);
        if (prefix.contains('begin:') || prefix.contains('end:')) continue;
        bad.add('$path:${line(m.start)} ${m.group(0)}');
      }
    }
    expect(bad, isEmpty, reason: bad.join('\n'));
  });
}

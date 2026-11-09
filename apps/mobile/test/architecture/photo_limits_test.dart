import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

/// Owner 2026-11-08 («каждая функция скорости работает»): a photo picked in
/// the app is shrunk with the admin's size and quality (`photoLimitsOf`,
/// `avatarLimitsOf`, the chat tuning), never with numbers written into one
/// screen. Two fixed formats are allowed: a sticker is 512 px by format
/// (like Telegram's), and a story is a full-screen 2160 px picture.
void main() {
  const allowed = {
    'lib/features/stickers/presentation/sticker_widgets.dart',
    'lib/features/stories/presentation/story_creator_screen.dart',
  };
  final literal = RegExp(
    r'(maxWidth|maxHeight):\s*\d+(\.\d+)?\s*,|imageQuality:\s*\d+\s*,',
  );

  test('image picker sizes come from the admin settings', () {
    final offenders = <String>[];
    for (final f in Directory('lib').listSync(recursive: true)) {
      if (f is! File || !f.path.endsWith('.dart')) continue;
      if (allowed.contains(f.path)) continue;
      final src = f.readAsStringSync();
      final calls = RegExp(
        r'ImagePicker\(\)\s*\.\s*pick\w*\(([^;]*?)\);',
        dotAll: true,
      );
      for (final call in calls.allMatches(src)) {
        if (literal.hasMatch(call.group(1)!)) {
          final line = src.substring(0, call.start).split('\n').length;
          offenders.add('${f.path}:$line');
        }
      }
    }
    expect(offenders, isEmpty);
  });
}

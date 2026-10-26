import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/feed_topics.dart';

/// Owner 2026-10-15: no topic is left without a cover — every practice
/// category has its picture, and the picture file exists.
void main() {
  test('every practice category has a cover and the file is there', () {
    for (final code in kPracticeCategoryCodes) {
      expect(kPracticeArtAssets, contains(code), reason: 'no art for $code');
    }
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('assets/practice_art'));
    final dir = Directory('assets/practice_art');
    expect(dir.existsSync(), isTrue);
    final files = dir
        .listSync(recursive: true)
        .whereType<File>()
        .map((f) => f.path)
        .join('\n');
    for (final code in kPracticeCategoryCodes) {
      expect(files, contains(code), reason: 'no file for $code');
    }
  });
}

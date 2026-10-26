import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/domain/post_text.dart';

/// Owner 2026-10-18: publishing and showing use one rule — the first line
/// is the title, the rest is the text.
void main() {
  test('first line = title, the rest = text', () {
    expect(
      splitPostText('Green card\nStep one.\nStep two.'),
      ('Green card', 'Step one.\nStep two.'),
    );
  });

  test('no line break: the whole short text is the title', () {
    expect(
      splitPostText('A quiet Friday at the office. Coffee.'),
      ('A quiet Friday at the office. Coffee.', ''),
    );
  });

  test('a first line over the limit is cut at a word; its rest starts the text',
      () {
    final long = List.filled(40, 'word').join(' ');
    final (title, text) = splitPostText(long);
    expect(title.length, lessThanOrEqualTo(kPostTitleMaxChars));
    expect('$title $text', long);
  });
}

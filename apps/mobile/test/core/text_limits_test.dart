import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/limits/text_limits.dart';

/// Owner 2026-10-15: the field limits are the admin's numbers.
void main() {
  tearDown(() => TextLimits.apply(const {}));

  test('before the first answer the starter values stand', () {
    TextLimits.apply(const {});
    // Owner 2026-10-19: starter values as in Instagram.
    expect(TextLimits.of(TextLimit.chatMessage), 1000);
    expect(TextLimits.of(TextLimit.comment), 2200);
    expect(TextLimits.of(TextLimit.postBrief), 3000);
    expect(TextLimits.of(TextLimit.postMedia), 2200);
    expect(TextLimits.of(TextLimit.bio), 150);
    expect(TextLimits.of(TextLimit.name), 30);
  });

  test("the admin's numbers win, bad values are ignored", () {
    TextLimits.apply(const {
      'limits.comment_chars': '1500',
      'limits.bio_chars': '0',
      'limits.chat_message_chars': 'many',
      'post.max_chars_brief': '4096',
    });
    expect(TextLimits.of(TextLimit.comment), 1500);
    expect(TextLimits.of(TextLimit.bio), 150);
    expect(TextLimits.of(TextLimit.chatMessage), 1000);
    expect(TextLimits.of(TextLimit.postBrief), 4096);
  });

  test('every limit has its own key', () {
    final keys = TextLimit.values.map((l) => l.key).toSet();
    expect(keys.length, TextLimit.values.length);
  });
}

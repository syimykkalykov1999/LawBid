import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';

void main() {
  test('a post of 1-3 emoji is drawn big, anything else is not', () {
    expect(emojiOnlySize('😎'), 44);
    expect(emojiOnlySize(' 👍🏽 '), 44);
    expect(emojiOnlySize('😎 🔥'), 36);
    expect(emojiOnlySize('🔥🔥🔥'), 30);
    expect(emojiOnlySize('🔥🔥🔥🔥'), isNull);
    expect(emojiOnlySize('😎 hi'), isNull);
    expect(emojiOnlySize('Привет'), isNull);
    expect(emojiOnlySize('12'), isNull);
    expect(emojiOnlySize(''), isNull);
  });
}

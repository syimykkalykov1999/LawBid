import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('a draft survives a restart and goes away when emptied', () async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    ProviderContainer make() => ProviderContainer(
          overrides: [
            sharedPreferencesProvider.overrideWithValue(prefs),
            currentUserIdProvider.overrideWithValue('u1'),
          ],
        );

    final first = make();
    first.read(chatTextDraftsProvider.notifier).set('c1', 'See you at ten');
    first.dispose(); // flushes the pending write

    final second = make();
    expect(second.read(chatTextDraftsProvider), {'c1': 'See you at ten'});
    second.read(chatTextDraftsProvider.notifier).set('c1', '  ');
    second.dispose();

    final third = make();
    expect(third.read(chatTextDraftsProvider), isEmpty);
    third.dispose();

    // Another account on the same device sees nothing of it.
    final other = ProviderContainer(
      overrides: [
        sharedPreferencesProvider.overrideWithValue(prefs),
        currentUserIdProvider.overrideWithValue('u2'),
      ],
    );
    expect(other.read(chatTextDraftsProvider), isEmpty);
    other.dispose();
  });
}

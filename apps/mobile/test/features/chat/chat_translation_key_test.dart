import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_translation.dart';

/// Verify 17.11 T4: a chat message's translation belongs to its text — an
/// edited message never shows the translation of its old text, a revoked
/// one shows none.
ChatMessage msg(String body, {bool revoked = false}) => ChatMessage(
      id: 'm1',
      conversationId: 'c1',
      kind: MessageKind.text,
      body: body,
      createdAt: DateTime(2026, 11, 17),
      revoked: revoked,
    );

void main() {
  test('edited message: the old translation is not shown nor reused', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    final original = msg('Hello');
    c
        .read(chatTranslationsProvider.notifier)
        .show(chatTranslationKey(original), 'Привет');
    expect(
      chatTranslationOf(c.read(chatTranslationsProvider), original),
      'Привет',
    );
    final edited = msg('Hello, see you at 5');
    expect(
      chatTranslationOf(c.read(chatTranslationsProvider), edited),
      isNull,
    );
    expect(
      c
          .read(chatTranslationsProvider.notifier)
          .cached(chatTranslationKey(edited)),
      isNull,
    );
  });

  test('revoked message: no translation shown', () {
    final c = ProviderContainer();
    addTearDown(c.dispose);
    c
        .read(chatTranslationsProvider.notifier)
        .show(chatTranslationKey(msg('Hello')), 'Привет');
    expect(
      chatTranslationOf(
        c.read(chatTranslationsProvider),
        msg('Hello', revoked: true),
      ),
      isNull,
    );
  });
}

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/awaiting_reply.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

Conversation _conv(
  String body, {
  String from = 'u-1',
  String msgId = 'm1',
  MessageKind kind = MessageKind.text,
}) =>
    Conversation(
      id: 'c1',
      caseId: 'case-1',
      caseTitle: 'Custody',
      status: ConversationStatus.active,
      contactsUnlocked: true,
      counterpart: const Counterpart(
        isAttorney: false,
        verified: false,
        id: 'u-1',
        displayName: 'Person',
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      lastMessage: ChatMessage(
        id: msgId,
        conversationId: 'c1',
        kind: kind,
        body: body,
        createdAt: DateTime(2026),
        senderId: from,
      ),
    );

/// Owner 2026-11-04 (N-03): «Awaiting reply» goes away after «thanks» /
/// «bye» and after «No reply needed» until a newer message.
void main() {
  final en = closingPhrasesOf(const StaticTranslatorEn());
  final ru = closingPhrasesOf(const StaticTranslatorRu());
  bool awaits(Conversation c, {Map<String, String> dismissed = const {}}) =>
      awaitsMyReply(c, me: 'me', closing: en, dismissed: dismissed);

  group('closing phrases', () {
    test('thanks / bye in English, any case and punctuation', () {
      for (final s in [
        'Thanks!',
        'thank you.',
        '  BYE ',
        'Thank you so much!!',
      ]) {
        expect(isClosingMessage(s, en), isTrue, reason: s);
      }
    });

    test('Russian list also works, English is always checked too', () {
      expect(isClosingMessage('Спасибо!', ru), isTrue);
      expect(isClosingMessage('До свидания.', ru), isTrue);
      expect(isClosingMessage('thanks', ru), isTrue);
    });

    test('a real question or a thanks with more is not closing', () {
      for (final s in [
        'Thanks, but when is the hearing?',
        'Can you call me?',
        '',
        '👍',
      ]) {
        expect(isClosingMessage(s, en), isFalse, reason: s);
      }
    });
  });

  group('label', () {
    test('shows after a question, hides after thanks', () {
      expect(awaits(_conv('When is the hearing?')), isTrue);
      expect(awaits(_conv('Thanks!')), isFalse);
      expect(awaits(_conv('Thanks, bye!')), isFalse);
      expect(awaits(_conv('Спасибо, а когда суд?')), isTrue);
    });

    test('hidden when I wrote last or the last line is a system one', () {
      expect(awaits(_conv('Question?', from: 'me')), isFalse);
      expect(awaits(_conv('Joined', kind: MessageKind.system)), isFalse);
    });

    test('«No reply needed» hides it for that message only', () {
      final c = _conv('Question?');
      expect(awaits(c, dismissed: {'c1': 'm1'}), isFalse);
      // A new incoming message brings the label back.
      final newer = _conv('Question?', msgId: 'm2');
      expect(awaits(newer, dismissed: {'c1': 'm1'}), isTrue);
    });
  });

  group('dismissed, kept per user on the phone', () {
    Future<ProviderContainer> open(String? user) async {
      final prefs = await SharedPreferences.getInstance();
      final c = ProviderContainer(
        overrides: [
          sharedPreferencesProvider.overrideWithValue(prefs),
          currentUserIdProvider.overrideWithValue(user),
        ],
      );
      addTearDown(c.dispose);
      return c;
    }

    test('survives a restart, is not shared with another user', () async {
      SharedPreferences.setMockInitialValues({});
      final a = await open('me');
      await a.read(awaitingReplyDismissedProvider.notifier).dismiss('c1', 'm1');
      expect(a.read(awaitingReplyDismissedProvider), {'c1': 'm1'});

      final restarted = await open('me');
      expect(restarted.read(awaitingReplyDismissedProvider), {'c1': 'm1'});

      final other = await open('someone-else');
      expect(other.read(awaitingReplyDismissedProvider), isEmpty);
    });

    test('broken stored data is ignored', () async {
      SharedPreferences.setMockInitialValues({'chat.no_reply.me': '{oops'});
      final c = await open('me');
      expect(c.read(awaitingReplyDismissedProvider), isEmpty);
    });
  });
}

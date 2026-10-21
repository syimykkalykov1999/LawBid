import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/deeplinks/deep_link.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';

import 'channels_fakes.dart';

/// Owner 2026-10-20: channel rules the screens and the server share — the
/// @username shape, one reaction per reader, the public link, the
/// notification of a new post.
void main() {
  group('@username', () {
    test('is lowercase 4-32 letters, digits, _, starting with a letter', () {
      expect(isValidChannelUsername('tax_news'), isTrue);
      expect(isValidChannelUsername('@Tax_News'), isTrue); // normalized
      expect(isValidChannelUsername('abc'), isFalse); // too short
      expect(isValidChannelUsername('1abcd'), isFalse); // starts with a digit
      expect(isValidChannelUsername('_abcd'), isFalse);
      expect(isValidChannelUsername('ab-cd'), isFalse);
      expect(isValidChannelUsername('a' * 32), isTrue);
      expect(isValidChannelUsername('a' * 33), isFalse);
    });

    test('is normalized like the server does', () {
      expect(normalizeChannelUsername('  @Tax_News '), 'tax_news');
    });
  });

  group('one reaction per reader', () {
    final base = fakePost(
      'p',
      reactions: const [
        ChannelReactionCount('👍', 2),
        ChannelReactionCount('🔥', 1),
      ],
    );

    test('a new reaction adds one to its emoji', () {
      final next = base.withMyReaction('❤️');
      expect(next.myReaction, '❤️');
      expect(next.countOf('❤️'), 1);
      expect(next.countOf('👍'), 2);
    });

    test('changing it moves the count and drops an empty emoji', () {
      final mine = fakePost(
        'p',
        mine: '🔥',
        reactions: const [
          ChannelReactionCount('👍', 2),
          ChannelReactionCount('🔥', 1),
        ],
      );
      final next = mine.withMyReaction('👍');
      expect(next.myReaction, '👍');
      expect(next.countOf('🔥'), 0);
      expect(next.reactions.map((r) => r.emoji), ['👍']);
      expect(next.countOf('👍'), 3);
    });

    test('removing it takes its count back', () {
      final next = base.withMyReaction('👍').withMyReaction(null);
      expect(next.myReaction, isNull);
      expect(next.countOf('👍'), 2);
    });

    test('emoji keep the server order', () {
      final next = base.withMyReaction('🙏');
      expect(next.reactions.map((r) => r.emoji), ['👍', '🔥', '🙏']);
    });
  });

  group('the public link', () {
    DeepLink? parse(String url) => parseDeepLink(
          Uri.parse(url),
          host: 'lawbid.dev',
        );

    test('/c/:username opens the channel', () {
      final link = parse('https://lawbid.dev/c/Tax_News')! as ContentDeepLink;
      expect(link.kind, ContentKind.channel);
      expect(link.id, 'tax_news');
      expect(link.location, '/c/tax_news');
    });

    test('a shared post rides along', () {
      final link = parse('https://lawbid.dev/c/tax_news?post=abc-123')!
          as ContentDeepLink;
      expect(link.postId, 'abc-123');
      expect(link.location, '/c/tax_news?post=abc-123');
    });

    test('the app scheme works the same', () {
      final link = parse('lawbid://c/tax_news')! as ContentDeepLink;
      expect(link.location, '/c/tax_news');
    });

    test('rubbish is ignored; the other links are untouched', () {
      expect(parse('https://lawbid.dev/c/ab'), isNull);
      expect(parse('https://lawbid.dev/c/bad-name'), isNull);
      expect(parse('https://evil.test/c/tax_news'), isNull);
      expect(
        (parse('https://lawbid.dev/post/p1')! as ContentDeepLink).location,
        '/post/p1',
      );
      expect(
        (parse('https://lawbid.dev/lawyer/anna')! as ContentDeepLink).location,
        '/lawyer/anna',
      );
    });

    test('routes build the same paths', () {
      expect(ChannelsRoutes.byUsername('tax_news'), '/c/tax_news');
      expect(ChannelsRoutes.channel('id 1'), '/channels/id%201');
      expect(
        ChannelsRoutes.channel('ch', postId: 'p'),
        '/channels/ch?post=p',
      );
    });
  });

  group('the channel_post notification', () {
    AppNotification n(Map<String, Object?> payload) => AppNotification(
          id: 'n1',
          type: 'channel_post',
          category: NotifCategory.social,
          payload: payload,
          aggregateCount: 1,
          createdAt: DateTime(2026, 10, 20),
        );

    test('reads «New post in "channel"» in both languages', () {
      final payload = {'channelId': 'ch-1', 'channelTitle': 'Tax news'};
      expect(
        notificationText(const StaticTranslatorEn(), n(payload)),
        'New post in “Tax news”',
      );
      expect(
        notificationText(const StaticTranslatorRu(), n(payload)),
        'Новый пост в канале «Tax news»',
      );
    });

    test('a tap opens the channel, with the post first', () {
      String? to(Map<String, Object?> payload) => notificationRoute(
            type: 'channel_post',
            payload: payload,
            attorney: false,
          );
      expect(
        to({'channelId': 'ch-1', 'postId': 'p-9'}),
        '/channels/ch-1?post=p-9',
      );
      expect(to({'channelId': 'ch-1'}), '/channels/ch-1');
      expect(to({}), ChannelsRoutes.list);
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_post_card.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart'
    show messagePreview;
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/long_locale.dart';
import '../../helpers/pending_strings.dart';
import '../../helpers/ux_harness.dart';

Map<String, dynamic> _json({Map<String, dynamic>? post}) => {
      'id': 'm1',
      'conversationId': 'c1',
      'senderId': 'u2',
      'type': 'post',
      'body': 'p1',
      'contactMasked': false,
      'createdAt': '2026-10-21T10:00:00.000Z',
      'revoked': false,
      'forwarded': false,
      'reactions': <dynamic>[],
      'pinned': false,
      'post': post,
    };

const _card = SharedPostCard(
  id: 'p1',
  available: true,
  authorId: 'a1',
  authorName: 'Alexandra Konstantinopoulou-Richardson',
  authorUsername: 'alexandra_konstantinopoulou',
  title: 'Five things every tenant should know before signing a lease',
  excerpt: 'Read the whole lease twice, then ask about the deposit, repairs, '
      'renewal terms and what happens if you need to leave early.',
);

void main() {
  test('a post message maps to a post card (and a gone post to unavailable)',
      () {
    final m = ChatMappers.message(
      api.MessageDto.fromJson(
        _json(
          post: {
            'id': 'p1',
            'author': {
              'id': 'a1',
              'role': 'attorney',
              'username': 'anna',
              'firstName': 'Anna',
              'lastName': 'Lee',
              'avatarUrl': null,
              'verifiedBadge': true,
            },
            'title': 'Leases',
            'excerpt': 'Read it twice',
            'thumbnailUrl': 'https://cdn.test/p1.jpg',
            'isVideo': true,
            'available': true,
          },
        ),
      ),
    );
    expect(m.kind, MessageKind.post);
    expect(m.post!.id, 'p1');
    expect(m.post!.authorName, 'Anna Lee');
    expect(m.post!.authorUsername, 'anna');
    expect(m.post!.authorVerified, isTrue);
    expect(m.post!.title, 'Leases');
    expect(m.post!.thumbnailUrl, 'https://cdn.test/p1.jpg');
    expect(m.post!.isVideo, isTrue);
    expect(m.post!.available, isTrue);

    final gone = ChatMappers.message(
      api.MessageDto.fromJson(
        _json(
          post: {'id': 'p1', 'isVideo': false, 'available': false},
        ),
      ),
    );
    expect(gone.post!.available, isFalse);
    expect(gone.post!.authorName, isNull);
  });

  test('the chat list says «Post» for a post message', () {
    const t = StaticTranslatorEn();
    final m = ChatMappers.message(api.MessageDto.fromJson(_json()));
    expect(messagePreview(t, m), contains('Post'));
  });

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    Translator translator = const StaticTranslatorEn(),
    ThemeData? theme,
    TextDirection dir = TextDirection.ltr,
    double scale = 1,
  }) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: uxOverrides(translator: translator),
        child: MaterialApp(
          theme: theme ?? AppTheme.light(),
          builder: (context, c) => Directionality(
            textDirection: dir,
            child: MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(scale),
                disableAnimations: true,
              ),
              child: c!,
            ),
          ),
          home: Scaffold(
            body: Align(
              alignment: AlignmentDirectional.topStart,
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: child,
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pump();
  }

  testWidgets('the card shows the author, title and text; tap target',
      (tester) async {
    await pump(tester, const PostCardBody(card: _card, mine: false));
    expect(find.byKey(const ValueKey('chat-post-p1')), findsOneWidget);
    expect(find.textContaining('Alexandra', findRichText: true), findsWidgets);
    expect(find.textContaining('Five things', findRichText: true), findsOne);
    expect(tester.takeException(), isNull);
  });

  testWidgets('a gone post says it is unavailable', (tester) async {
    await pump(
      tester,
      const PostCardBody(
        card: SharedPostCard(id: 'p1', available: false),
        mine: true,
      ),
    );
    expect(find.byKey(const ValueKey('chat-post-gone-p1')), findsOneWidget);
    expect(find.text('Post unavailable'), findsOneWidget);
  });

  // Owner rule: 4 themes x long / ru / ne / ar at 360 dp, text x1 and x1.1.
  final locales = <String, (Translator, TextDirection)>{
    'longest': (
      PendingTranslator.of(LongestTranslator(), 'share', 'longest'),
      TextDirection.ltr,
    ),
    'ru': (
      PendingTranslator.of(
        L10nTranslator(language: AppLanguage.ru, cache: const {}),
        'share',
        'ru',
      ),
      TextDirection.ltr,
    ),
    'ne': (
      PendingTranslator.of(ShippedTranslator('ne'), 'share', 'ne'),
      TextDirection.ltr,
    ),
    'ar': (
      PendingTranslator.of(ShippedTranslator('ar'), 'share', 'ar'),
      TextDirection.rtl,
    ),
  };
  for (final theme in AppThemeId.values) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      for (final scale in [1.0, 1.1]) {
        testWidgets('no overflow: ${theme.name}, $name, x$scale',
            (tester) async {
          useNarrowPhone(tester);
          await pump(
            tester,
            const Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                PostCardBody(card: _card, mine: true),
                SizedBox(height: 8),
                PostCardBody(
                  card: SharedPostCard(id: 'p2', available: false),
                  mine: false,
                ),
              ],
            ),
            translator: t,
            theme: AppTheme.of(theme),
            dir: dir,
            scale: scale,
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}

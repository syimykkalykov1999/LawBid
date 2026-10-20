import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_admins_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_comments_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_composer_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_form_screen.dart';
import 'package:lawbid/features/channels/presentation/channel_screen.dart';
import 'package:lawbid/features/channels/presentation/channels_screen.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../../helpers/long_locale.dart';
import 'channels_fakes.dart';

/// Owner 2026-10-20: every channels screen on a 360 dp phone with long
/// names and the longest translation of every key, left-to-right and
/// right-to-left, at text scale 1 and at the largest the app allows (1.1).
/// Any overflow fails.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(() {
    VisibilityDetectorController.instance.updateInterval = Duration.zero;
  });

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ne': (ShippedTranslator('ne'), TextDirection.ltr),
    'ar': (ShippedTranslator('ar'), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  final longName = 'Международная налоговая ${'консультация' * 4}';
  final longBody = 'Look at https://example.test/${'very-long-path' * 6} '
      '${'unbreakable' * 12}\n${'Line of the post. ' * 40}';

  Channel channel({ChannelRole? role}) => fakeChannel(
        title: longName,
        username: 'a_very_long_channel_username_32ch',
        description: 'Long description ${'about taxes ' * 20}',
        role: role,
        subscribers: 1234567,
        posts: 98765,
      );

  FakeChannelsRepository repo({ChannelRole? role}) => FakeChannelsRepository(
        channel: channel(role: role),
        feed: [
          fakePost(
            'p1',
            body: longBody,
            comments: 12345,
            views: 987654,
            mine: '🔥',
            reactions: const [
              ChannelReactionCount('👍', 1200),
              ChannelReactionCount('❤️', 340),
              ChannelReactionCount('🔥', 99),
              ChannelReactionCount('👏', 7),
              ChannelReactionCount('😮', 3),
              ChannelReactionCount('🙏', 1),
            ],
          ),
        ],
        commentList: [
          for (var i = 0; i < 3; i++)
            ChannelComment(
              id: 'c$i',
              author: const ChannelPerson(
                id: 'u',
                username: 'x',
                name: 'Очень длинное имя автора комментария',
              ),
              body: longBody,
              createdAt: DateTime(2026, 10, 19),
              canDelete: true,
            ),
        ],
      )..listed = [channel(role: ChannelRole.owner), channel()];

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      group('no overflow at 360 dp ($name, text x$scale)', () {
        Widget frame(BuildContext context, Widget? child) => Directionality(
              textDirection: dir,
              child: MediaQuery(
                data: MediaQuery.of(context).copyWith(
                  textScaler: TextScaler.linear(scale),
                  disableAnimations: true,
                ),
                child: child!,
              ),
            );

        Future<void> pump(
          WidgetTester tester,
          Widget home,
          FakeChannelsRepository r, {
          List<Override> extra = const [],
        }) async {
          useNarrowPhone(tester);
          await tester.pumpWidget(
            ProviderScope(
              overrides: [...channelsOverrides(r, translator: t), ...extra],
              child: MaterialApp(
                theme: AppTheme.light(),
                builder: frame,
                home: home,
              ),
            ),
          );
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        }

        testWidgets('channels list', (tester) async {
          await pump(tester, const ChannelsScreen(), repo());
        });

        testWidgets('channel page, reader', (tester) async {
          await pump(
            tester,
            const ChannelScreen(channelRef: 'tax_news'),
            repo(),
          );
        });

        testWidgets('channel page, admin', (tester) async {
          await pump(
            tester,
            const ChannelScreen(channelRef: 'tax_news'),
            repo(role: ChannelRole.owner),
          );
        });

        testWidgets('composer', (tester) async {
          await pump(
            tester,
            const ChannelComposerScreen(channelId: 'ch-1'),
            repo(),
          );
        });

        testWidgets('create form', (tester) async {
          await pump(tester, const ChannelFormScreen(), repo());
        });

        testWidgets('edit form', (tester) async {
          await pump(
            tester,
            const ChannelFormScreen(channelRef: 'ch-1'),
            repo(role: ChannelRole.owner),
          );
        });

        testWidgets('admins', (tester) async {
          final r = repo(role: ChannelRole.owner)
            ..admins0 = [
              const ChannelAdmin(user: owner, role: ChannelRole.owner),
              const ChannelAdmin(
                user: ChannelPerson(
                  id: 'u2',
                  username: 'a_very_long_admin_username_here',
                  name: 'Очень длинное имя администратора канала',
                ),
                role: ChannelRole.admin,
              ),
            ];
          await pump(
            tester,
            const ChannelAdminsScreen(channelId: 'ch-1'),
            r,
          );
        });

        testWidgets('comments', (tester) async {
          await pump(
            tester,
            const ChannelCommentsScreen(channelId: 'ch-1', postId: 'p1'),
            repo(),
          );
        });
      });
    }
  }
}

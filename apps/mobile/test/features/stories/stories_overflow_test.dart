import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/stories_tray.dart';
import 'package:lawbid/features/stories/presentation/story_archive_screen.dart';
import 'package:lawbid/features/stories/presentation/story_creator_screen.dart';
import 'package:lawbid/features/stories/presentation/story_settings_screen.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_screen.dart';

import '../../helpers/long_locale.dart';
import 'stories_fakes.dart';
import 'stories_harness.dart';

/// Owner 2026-10-20: the story screens on a 360 dp phone in the longest
/// translation of every key, right-to-left too, at text x1 and x1.1 (the
/// most the app allows). Any overflow fails.
void main() {
  setUpAll(initializeDateFormatting);

  final cases = <String, (Translator, TextDirection)>{
    'longest': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
  };

  for (final scale in [1.0, 1.1]) {
    for (final MapEntry(key: name, value: (t, dir)) in cases.entries) {
      group('no overflow at 360 dp ($name, text x$scale)', () {
        Future<void> pump(
          WidgetTester tester,
          Widget home, {
          FakeStoriesRepository? repo,
          List<Override> extra = const [],
        }) async {
          useSmallPhone(tester);
          await tester.pumpWidget(
            storyApp(
              home,
              overrides: await storyOverrides(
                repo: repo,
                chat: FakeReplyChat(),
                translator: t,
                extra: extra,
              ),
              direction: dir,
              textScale: scale,
            ),
          );
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
        }

        testWidgets('creator: the three ways to start', (tester) async {
          await pump(tester, const StoryCreatorScreen());
          expect(find.byType(StoryCreatorScreen), findsOneWidget);
        });

        testWidgets('creator: text story with stickers row', (tester) async {
          await pump(tester, const StoryCreatorScreen());
          await tester.tap(find.byKey(const ValueKey('story-pick-text')));
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
          await tester.enterText(
            find.byKey(const ValueKey('story-text-field')),
            'A rather long text for a story card, to see it fit the frame '
            'without any overflow even in the longest language.',
          );
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);

          // The sticker grid and the audience sheet.
          await tester.tap(find.byKey(const ValueKey('story-sticker-add')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(find.text('😀'));
          await tester.pumpAndSettle();
          expect(find.byKey(const ValueKey('story-sticker-1')), findsOne);
          await tester.tap(find.byKey(const ValueKey('story-audience-chip')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });

        testWidgets('viewer chrome: bars, header, reply', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: StoryPlaybackView(
                stories: [
                  fakeStory(
                    'a',
                    author: const StoryUser(
                      id: 'u9',
                      username: 'a_really_long_user_name_here',
                      firstName: 'Bartholomew-Alexander',
                      lastName: 'Montgomery-Featherstonehaugh',
                      verified: true,
                    ),
                    text: 'x' * 280,
                  ),
                  fakeStory('b'),
                ],
                onClose: () {},
              ),
            ),
          );
          expect(find.byKey(const ValueKey('story-reply-field')), findsOne);
        });

        testWidgets('viewer chrome: my own story', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: StoryPlaybackView(
                stories: [
                  fakeStory('m', author: meUser, mine: true, views: 1234567),
                ],
                onClose: () {},
              ),
            ),
          );
          expect(
            find.byKey(const ValueKey('story-viewers-button')),
            findsOneWidget,
          );
        });

        testWidgets('tray', (tester) async {
          await pump(
            tester,
            const Scaffold(body: StoriesTray()),
            repo: FakeStoriesRepository(
              trayItems: [
                trayItem(meUser, isMe: true, count: 0, unseen: 0),
                trayItem(
                  const StoryUser(
                    id: 'u9',
                    username: 'long',
                    firstName: 'Bartholomew-Alexander',
                  ),
                ),
                trayItem(bob, unseen: 0),
              ],
            ),
          );
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
        });

        testWidgets('settings', (tester) async {
          await pump(
            tester,
            const StorySettingsScreen(),
            repo: FakeStoriesRepository()..hiddenUsers.addAll([anna, bob]),
          );
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
          expect(find.byKey(const ValueKey('story-hidden-u1')), findsOne);
        });

        testWidgets('archive (empty)', (tester) async {
          await pump(tester, const StoryArchiveScreen());
          await tester.pump(const Duration(milliseconds: 300));
          expect(tester.takeException(), isNull);
        });
      });
    }
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart' show XFile;
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/screens/create_case_screen.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_card.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/reels/presentation/video_editor_screen.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../helpers/long_locale.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-15: every screen this branch changed fits at 360 dp, in
/// the longest translation of every language (left-to-right and
/// right-to-left), at font 1.0 / 1.1 / 1.3, in all four themes.
void main() {
  setUpAll(initializeDateFormatting);

  final dirs = {'ltr': TextDirection.ltr, 'rtl': TextDirection.rtl};

  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      reelsEnabledProvider.overrideWithValue(true),
    ];
  });

  Future<void> pump(
    WidgetTester tester,
    Widget child, {
    required AppThemeId theme,
    required double scale,
    required TextDirection dir,
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: child),
        theme: AppTheme.of(theme),
        size: narrowPhone,
        textScale: scale,
        disableAnimations: true,
        overrides: uxOverrides(translator: LongestTranslator(), extra: base),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  for (final theme in AppThemeId.values) {
    for (final scale in [1.0, 1.1, 1.3]) {
      for (final MapEntry(key: dirName, value: dir) in dirs.entries) {
        final tag = '${theme.name} x$scale $dirName';
        final t = LongestTranslator();

        testWidgets('post form, $tag', (tester) async {
          await pump(
            tester,
            const CreatePostScreen(),
            theme: theme,
            scale: scale,
            dir: dir,
          );
          expect(tester.takeException(), isNull);
          // The tiles are really there (not an empty or errored screen).
          expect(find.text(t.t('post.src.gallery')), findsOneWidget);
          expect(find.text(t.t('post.src.camera')), findsOneWidget);
        });

        // Owner 2026-10-16: after the first photo the Gallery / Camera cards
        // stay next to the thumbnails (compact), until 9 photos.
        testWidgets('post form with 1 photo keeps the add cards, $tag', (
          tester,
        ) async {
          await pump(
            tester,
            const CreatePostScreen(debugPhotoCount: 1),
            theme: theme,
            scale: scale,
            dir: dir,
          );
          expect(tester.takeException(), isNull);
          expect(
            find.byKey(const ValueKey('post-add-gallery')),
            findsOneWidget,
          );
          expect(find.byKey(const ValueKey('post-add-camera')), findsOneWidget);
          expect(find.textContaining('1 / 9'), findsOneWidget);
        });

        testWidgets('case wizard exit sheet, $tag', (tester) async {
          await pump(
            tester,
            Scaffold(body: CreateCaseExitSheet(t: t)),
            theme: theme,
            scale: scale,
            dir: dir,
          );
          expect(tester.takeException(), isNull);
          expect(find.text(t.t('cases.create.exitTitle')), findsOneWidget);
        });

        testWidgets('post form with 9 photos has no add cards, $tag', (
          tester,
        ) async {
          await pump(
            tester,
            const CreatePostScreen(debugPhotoCount: 9),
            theme: theme,
            scale: scale,
            dir: dir,
          );
          expect(tester.takeException(), isNull);
          expect(find.byKey(const ValueKey('post-add-gallery')), findsNothing);
          expect(find.textContaining('9 / 9'), findsOneWidget);
        });

        testWidgets('video editor, $tag', (tester) async {
          for (final tab in [0, 1]) {
            await pump(
              tester,
              VideoEditorScreen(
                file: XFile('/none.mp4'),
                cut: const ReelCut(
                  totalMs: 95000,
                  startMs: 5000,
                  endMs: 65000,
                  coverMs: 24000,
                ),
                maxMs: 180000,
                initialTab: tab,
              ),
              theme: theme,
              scale: scale,
              dir: dir,
            );
            expect(tester.takeException(), isNull);
          }
        });

        testWidgets('active cards and case chips, $tag', (tester) async {
          await pump(
            tester,
            Scaffold(
              body: SingleChildScrollView(
                child: Column(
                  children: [
                    for (final (status, next, danger) in [
                      ('cases.status.disputed', 'mine.next.dispute', true),
                      (
                        'cases.status.pendingCompletion',
                        'mine.next.confirmDone',
                        false,
                      ),
                      (
                        'cases.status.inProgress',
                        'mine.next.agreePrice',
                        false,
                      ),
                      ('cases.status.open', 'mine.next.waitingBids', false),
                    ])
                      ActiveCaseCard(
                        title:
                            'Demo active: long title for the card in every '
                            'language and every font size',
                        practiceName: t.t('practice.real_estate'),
                        statusLabel: t.t(status),
                        statusTone: StatusTone.warning,
                        stage: 3,
                        stageLabel: t.t('mine.stage.short', {'n': '4'}),
                        next: t.t(next),
                        nextDate: '15. Okt.',
                        nextDanger: danger,
                        nextYours: !danger,
                        price: t.t('mine.price.negotiable'),
                        stateCode: 'FL +2',
                        categoryCode: 'real_estate',
                        badge: 12,
                        onTap: () {},
                      ),
                    CaseChipsRow(
                      labels: [
                        t.t('practice.immigration'),
                        t.t('practice.family_law'),
                      ],
                      status: t.t('cases.status.acceptedByBoth'),
                    ),
                    CaseTextTabs(
                      items: [
                        CaseTabItem(t.t('cases.tab.overview')),
                        CaseTabItem(t.t('cases.tab.files'), count: 3),
                        CaseTabItem(t.t('cases.tab.tasks'), count: 2),
                        CaseTabItem(t.t('cases.tab.updates'), count: 5),
                        CaseTabItem(t.t('cases.tab.activity')),
                      ],
                      index: 0,
                      onChanged: (_) {},
                    ),
                  ],
                ),
              ),
            ),
            theme: theme,
            scale: scale,
            dir: dir,
          );
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}

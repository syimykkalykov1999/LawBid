import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/domain/story_snap.dart';
import 'package:lawbid/features/stories/presentation/story_creator_screen.dart';
import 'package:lawbid/features/stories/presentation/story_guides.dart';
import 'package:lawbid/features/stories/stories_routes.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/pending_strings.dart';
import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';
import 'stories_fakes.dart';
import 'stories_harness.dart';

class _Social extends FakeSocialRepository {
  _Social() : super(posts: [fakePost('p1', withPhoto: true)]);

  final uploads = <Uint8List>[];

  @override
  Future<String> uploadPostPhoto(
    Uint8List bytes, {
    void Function(double progress)? onProgress,
    bool casePhoto = false,
    bool reviewPhoto = false,
    String? fileName,
    int? maxBytes,
  }) async {
    uploads.add(bytes);
    return 'file-1';
  }
}

Future<List<Override>> _overrides(
  FakeStoriesRepository repo,
  _Social social, {
  Translator translator = const StaticTranslatorEn(),
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return [
    ...uxOverrides(translator: translator, storiesTray: false, social: social),
    sharedPreferencesProvider.overrideWithValue(prefs),
    storiesRepositoryProvider.overrideWithValue(repo),
    storiesEnabledProvider.overrideWithValue(true),
    currentUserIdProvider.overrideWithValue('me'),
  ];
}

void main() {
  setUpAll(initializeDateFormatting);

  final sticker = find.byKey(const ValueKey('story-post-sticker-p1'));
  final guides = find.byKey(const ValueKey('story-guides'));

  Future<({FakeStoriesRepository repo, _Social social})> open(
    WidgetTester tester,
  ) async {
    useSmallPhone(tester);
    final repo = FakeStoriesRepository();
    final social = _Social();
    await tester.pumpWidget(
      storyApp(
        const StoryCreatorScreen(postId: 'p1'),
        overrides: await _overrides(repo, social),
      ),
    );
    await tester.pumpAndSettle();
    return (repo: repo, social: social);
  }

  testWidgets('/stories/new?post= opens the editor with the post sticker',
      (tester) async {
    useSmallPhone(tester);
    final root = GlobalKey<NavigatorState>();
    final router = GoRouter(
      navigatorKey: root,
      initialLocation: StoriesRoutes.createWith(postId: 'p1'),
      routes: storiesRoutes(root),
    );
    addTearDown(router.dispose);
    await tester.pumpWidget(
      ProviderScope(
        overrides: await _overrides(FakeStoriesRepository(), _Social()),
        child: MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      tester.widget<StoryCreatorScreen>(find.byType(StoryCreatorScreen)).postId,
      'p1',
    );
    expect(sticker, findsOneWidget);
    // The gradient picker, not the camera.
    expect(find.byKey(const ValueKey('story-bg-ocean')), findsOneWidget);
  });

  testWidgets(
      'dragging near the centre snaps onto it, shows the guide and ticks',
      (tester) async {
    await open(tester);
    final ticks = <String>[];
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'HapticFeedback.vibrate') {
          ticks.add('${call.arguments}');
        }
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null),
    );
    final centre = tester.getCenter(sticker);

    final g = await tester.startGesture(centre);
    await g.moveBy(const Offset(40, 0));
    await tester.pump();
    StoryGuidesPainter painterOf() =>
        tester.widget<CustomPaint>(guides).painter! as StoryGuidesPainter;
    // Off the vertical centre line (still on the horizontal one).
    expect(painterOf().guides, isNot(contains(StoryGuide.centerX)));
    expect(tester.getCenter(sticker).dx, greaterThan(centre.dx + 20));

    // Back to 3 px from the centre: it sits exactly on it, the guide shows.
    await g.moveBy(const Offset(-37, 0));
    await tester.pump();
    expect(painterOf().guides, contains(StoryGuide.centerX));
    expect(tester.getCenter(sticker).dx, closeTo(centre.dx, 0.01));
    expect(ticks, contains('HapticFeedbackType.selectionClick'));

    await g.up();
    await tester.pump();
    expect(guides, findsNothing);
  });

  testWidgets('Share bakes the post into a photo; only emoji stay overlays',
      (tester) async {
    final r = await open(tester);
    await tester.tap(find.byKey(const ValueKey('story-sticker-add')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('🔥'));
    await tester.pumpAndSettle();

    await tester.runAsync(() async {
      await tester.tap(find.byKey(const ValueKey('story-share')));
      // toImage / PNG encoding run on the engine.
      for (var i = 0; i < 20 && r.repo.created.isEmpty; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
        await tester.pump();
      }
    });
    await tester.pump();
    expect(r.repo.created.single['kind'], StoryKind.photo);
    expect(r.repo.created.single['fileId'], 'file-1');
    expect(r.repo.created.single['overlays'], 1);
    // A PNG picture went up.
    expect(r.social.uploads.single.sublist(0, 4), [0x89, 0x50, 0x4E, 0x47]);
  });

  // Owner rule: 4 themes x longest / ru / ne / ar / de / mr at 360 dp, x1 and x1.1.
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
    'de': (
      PendingTranslator.of(ShippedTranslator('de'), 'share', 'de'),
      TextDirection.ltr,
    ),
    'mr': (
      PendingTranslator.of(ShippedTranslator('mr'), 'share', 'mr'),
      TextDirection.ltr,
    ),
  };
  for (final theme in AppThemeId.values) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      for (final scale in [1.0, 1.1]) {
        testWidgets('no overflow: ${theme.name}, $name, x$scale',
            (tester) async {
          useSmallPhone(tester);
          await tester.pumpWidget(
            storyApp(
              const StoryCreatorScreen(postId: 'p1'),
              overrides: await _overrides(
                FakeStoriesRepository(),
                _Social(),
                translator: t,
              ),
              theme: AppTheme.of(theme),
              direction: dir,
              textScale: scale,
            ),
          );
          await tester.pumpAndSettle();
          expect(sticker, findsOneWidget);
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}

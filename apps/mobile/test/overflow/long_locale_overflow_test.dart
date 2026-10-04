import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/attorney_tile.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/presentation/tasks_tab.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/social/social_fakes.dart';
import '../features/team/team_fakes.dart';
import '../helpers/long_locale.dart';
import '../helpers/referral_overrides.dart';
import '../helpers/ux_harness.dart';

/// Owner 2026-10-04: in long languages texts ran into each other, buttons
/// overlapped and the yellow-black overflow stripes showed. Every case here
/// is pumped on a 360 dp phone in the worst case of all shipped languages
/// (longest translation per key), the same mirrored right-to-left, and in
/// Russian; any RenderFlex overflow fails the test.
class _SuggestingSocial extends FakeSocialRepository {
  @override
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor}) async =>
      CursorPage(
        items: [
          for (var i = 0; i < 4; i++)
            AttorneyRow(
              id: 'att-$i',
              username: 'danielkim_immigration_$i',
              firstName: 'Daniel',
              lastName: 'Kim-Montgomery',
              verified: true,
              ratingAvg: 4.8,
              ratingCount: 0,
              states: const ['NY', 'CA'],
              practiceKeys: const [
                'practice.immigration',
                'practice.family_law',
              ],
              isFollowing: false,
            ),
        ],
      );
}

void main() {
  setUpAll(initializeDateFormatting);

  final locales = <String, (Translator, TextDirection)>{
    'longest of all languages': (LongestTranslator(), TextDirection.ltr),
    'longest, right-to-left': (LongestTranslator(), TextDirection.rtl),
    'ru': (
      L10nTranslator(language: AppLanguage.ru, cache: const {}),
      TextDirection.ltr,
    ),
  };

  late List<Override> base;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    base = [
      sharedPreferencesProvider.overrideWithValue(prefs),
      referralOffOverride,
    ];
  });

  Future<void> pump(
    WidgetTester tester,
    Widget child,
    Translator t,
    TextDirection dir, {
    List<Override> extra = const [],
    ThemeData? theme,
  }) async {
    useNarrowPhone(tester);
    await tester.pumpWidget(
      uxApp(
        Directionality(textDirection: dir, child: child),
        theme: theme ?? AppTheme.light(),
        size: narrowPhone,
        disableAnimations: true,
        overrides: uxOverrides(
          translator: t,
          social: _SuggestingSocial(),
          extra: [...base, ...extra],
        ),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  /// Shared design-system pieces with real translated labels.
  Widget gallery(Translator t) => Scaffold(
        appBar: AppTopBar(
          leading: AppBackButton(semanticLabel: 'Back', onPressed: () {}),
          title: Text(t.t('verification.title')),
        ),
        body: ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            PillTabs<int>(
              value: 0,
              padding: EdgeInsets.zero,
              tabs: [
                (0, t.t('search.tab.people')),
                (1, t.t('search.tab.cases')),
                (2, t.t('search.tab.posts')),
                (3, t.t('search.tab.tags')),
              ],
              onChanged: (_) {},
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(label: t.t('tasks.add'), onPressed: () {}),
            const SizedBox(height: AppSpacing.md),
            Row(
              children: [
                Expanded(
                  child: AppButton(
                    label: t.t('common.cancel'),
                    variant: AppButtonVariant.secondary,
                    onPressed: () {},
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppButton(label: t.t('common.save'), onPressed: () {}),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                AppChip(label: t.t('tasks.view.active'), selected: true),
                AppChip(label: t.t('tasks.view.done')),
                AppChip(
                  label: t.t('practice.technology_privacy_and_cyber_law'),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            AppListRow(
              label: t.t('settings.language'),
              trailingText: t.t('settings.theme.system'),
              onTap: () {},
            ),
            SizedBox(
              height: 360,
              child: AppEmptyState(
                title: t.t('tasks.empty'),
                message: t.t('tasks.empty.body'),
              ),
            ),
          ],
        ),
        bottomNavigationBar: AppBottomNav(
          tabs: [
            AppTabConfig(
              key: AppTabKey.feed,
              label: t.t('nav.tab.feed'),
              icon: AppIcons.homeOutlined,
              activeIcon: AppIcons.homeRounded,
            ),
            AppTabConfig(
              key: AppTabKey.search,
              label: t.t('nav.tab.search'),
              icon: AppIcons.searchRounded,
              activeIcon: AppIcons.searchRounded,
            ),
            AppTabConfig(
              key: AppTabKey.mine,
              label: t.t('nav.tab.mine'),
              icon: AppIcons.workOutlineRounded,
              activeIcon: AppIcons.workRounded,
            ),
            AppTabConfig(
              key: AppTabKey.profile,
              label: t.t('nav.tab.profile'),
              icon: AppIcons.personOutlineRounded,
              activeIcon: AppIcons.personRounded,
            ),
          ],
          currentIndex: 0,
          onTabSelected: (_) {},
          onCreatePressed: () {},
          createSemanticLabel: t.t('nav.create'),
        ),
      );

  for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
    group('no overflow at 360 dp ($name)', () {
      testWidgets('design-system widgets', (tester) async {
        await pump(tester, gallery(t), t, dir);
        expect(tester.takeException(), isNull);
      });

      testWidgets('recommended attorneys with "Follow"', (tester) async {
        await pump(
          tester,
          const Scaffold(
            body: SingleChildScrollView(child: SuggestedAttorneys()),
          ),
          t,
          dir,
        );
        expect(find.byType(AttorneyTile), findsWidgets);
        expect(tester.takeException(), isNull);
      });

      testWidgets('tasks: filter chips and "Add a task"', (tester) async {
        final repo = FakeTeamRepository()
          ..active = [makeTask('a', note: 'Call the court clerk')];
        await pump(
          tester,
          const Scaffold(body: TasksTab()),
          t,
          dir,
          extra: [teamRepositoryProvider.overrideWithValue(repo)],
        );
        expect(find.byKey(const ValueKey('tasks-add')), findsOneWidget);
        expect(tester.takeException(), isNull);
      });

      final screens = <String, Widget>{
        'feed': const FeedScreen(),
        'search': const SearchScreen(),
        'mine': const MineScreen(),
        'profile': const ProfileScreen(),
        'settings': const SettingsScreen(),
      };
      for (final s in screens.entries) {
        testWidgets('${s.key} screen', (tester) async {
          await pump(tester, s.value, t, dir, theme: AppTheme.dark());
          expect(tester.takeException(), isNull);
        });
      }
    });
  }
}

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/theme/theme_picker_sheet.dart';

import '../../core/l10n/l10n_test_harness.dart';

/// Owner 2026-10-22: the four themes side by side (Day, Night, Blue = the
/// Citi look, Green = the Credit Karma look): a typical screen (top bar,
/// cards, list, field, button, chat bubbles, tab bar) and the theme picker.
/// Files: `theme_home_<theme>.png`, `theme_picker_<theme>.png`.
class _Home extends StatelessWidget {
  const _Home();

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).extension<AppColorTokens>()!;
    final chat = ChatColors.of(context);
    Widget bubble(String text, {required bool mine}) => Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            margin: const EdgeInsets.only(top: 6),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: mine ? chat.mine : chat.theirs,
              borderRadius: BorderRadius.circular(14),
              border: mine ? null : Border.all(color: chat.theirsBorder),
            ),
            child: Text(
              text,
              style: TextStyle(color: mine ? chat.onMine : chat.onTheirs),
            ),
          ),
        );
    return Scaffold(
      backgroundColor: c.bg,
      appBar: AppTopBar(
        leading: AppBackButton(onPressed: () {}, semanticLabel: 'Back'),
        title: const Text('Case review'),
        actions: [
          AppIcon(AppIcons.searchOutlined, color: c.text),
          const SizedBox(width: 12),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          AppCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Inheritance dispute',
                  style: TextStyle(
                    color: c.text,
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Bishkek · 3 offers · 2 days left',
                  style: TextStyle(color: c.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          AppListSection(
            title: 'Settings',
            children: [
              AppListRow(
                label: 'Language',
                icon: AppIcons.searchOutlined,
                onTap: () {},
              ),
              AppListRow(
                label: 'Notifications',
                icon: AppIcons.searchOutlined,
                trailingText: 'On',
                onTap: () {},
              ),
            ],
          ),
          const SizedBox(height: 12),
          const AppTextField(hintText: 'Message', label: 'Reply'),
          const SizedBox(height: 12),
          bubble('Hello, I can take this case', mine: false),
          bubble('Great, let us talk tomorrow', mine: true),
          const SizedBox(height: 12),
          AppButton(label: 'Send offer', onPressed: () {}),
          const SizedBox(height: 8),
          AppButton(
            label: 'Decline',
            variant: AppButtonVariant.secondary,
            onPressed: () {},
          ),
        ],
      ),
      bottomNavigationBar: AppBottomNav(
        tabs: const [
          AppTabConfig(
            key: AppTabKey.feed,
            icon: AppIcons.homeOutlined,
            activeIcon: AppIcons.homeRounded,
            label: 'Feed',
          ),
          AppTabConfig(
            key: AppTabKey.search,
            icon: AppIcons.searchOutlined,
            activeIcon: AppIcons.search,
            label: 'Search',
          ),
          AppTabConfig(
            key: AppTabKey.mine,
            icon: AppIcons.folderOutlined,
            activeIcon: AppIcons.folder,
            label: 'Mine',
          ),
          AppTabConfig(
            key: AppTabKey.profile,
            icon: AppIcons.personOutline,
            activeIcon: AppIcons.person,
            label: 'Profile',
          ),
        ],
        currentIndex: 0,
        onTabSelected: (_) {},
        onCreatePressed: () {},
      ),
    );
  }
}

void main() {
  for (final spec in AppThemes.all) {
    final name = spec.wire;
    final theme = AppTheme.of(spec.id);

    testGoldens('home screen - $name', (tester) async {
      await tester.pumpWidgetBuilder(
        const _Home(),
        wrapper: materialAppWrapper(theme: theme),
        surfaceSize: const Size(390, 844),
      );
      await screenMatchesGolden(tester, 'theme_home_$name');
    });

    testGoldens('theme picker - $name', (tester) async {
      final h = await L10nHarness.create();
      final c = h.container(
        extra: [
          translatorProvider.overrideWithValue(const StaticTranslatorEn()),
        ],
      );
      await tester.binding.setSurfaceSize(const Size(390, 700));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: c,
          child: MaterialApp(
            theme: theme,
            home: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => ThemePickerSheet.show(context),
                  child: const Text('open'),
                ),
              ),
            ),
          ),
        ),
      );
      await tester.tap(find.text('open'));
      await tester.pumpAndSettle();
      await expectLater(
        find.byType(MaterialApp),
        matchesGoldenFile('goldens/theme_picker_$name.png'),
      );
    });
  }
}

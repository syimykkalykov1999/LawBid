import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/feed/presentation/screens/feed_screen.dart';
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/settings/active_devices/active_devices_providers.dart';
import 'package:lawbid/features/settings/active_devices/domain/active_devices_repository.dart';
import 'package:lawbid/features/settings/active_devices/presentation/active_devices_screen.dart';
import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:intl/date_symbol_data_local.dart';

import '../helpers/ux_harness.dart';

/// Accessibility guidelines (docs/01 §8.4: WCAG AA contrast, 44x44 touch
/// targets, screen-reader labels, text up to 200%; docs/07 §9) over every
/// design-system widget and the main in-app screens, in both themes.
///
/// Tap targets are checked against BOTH platform guidelines: iOS 44x44 and
/// Android 48x48. Controls whose visual size file 07 fixes below 48 (icon
/// buttons, the back chevron, chips, the "+" tab) meet the Android minimum
/// through `AppTapTarget` (invisible hit/semantics area, layout unchanged).
Future<void> expectAccessible(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(iOSTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

class _FakeDevicesRepo implements ActiveDevicesRepository {
  _FakeDevicesRepo({this.error, List<DeviceSessionInfo>? items, this.cursor})
      : items = items ?? _sessions;

  final Object? error;
  final List<DeviceSessionInfo> items;
  final String? cursor;

  static final _sessions = [
    DeviceSessionInfo(
      sessionId: 's1',
      deviceName: 'iPhone 15',
      platform: DevicePlatform.ios,
      createdAt: DateTime.utc(2026, 9),
      lastActiveAt: DateTime.utc(2026, 9, 26, 10, 30),
      isCurrent: true,
    ),
    DeviceSessionInfo(
      sessionId: 's2',
      platform: DevicePlatform.android,
      createdAt: DateTime.utc(2026, 8),
      isCurrent: false,
    ),
  ];

  @override
  Future<CursorPage<DeviceSessionInfo>> fetchPage({String? cursor}) async {
    if (error != null) throw error!;
    return CursorPage(items: items, nextCursor: this.cursor);
  }

  @override
  Future<void> revoke(String sessionId) async {}

  @override
  Future<void> logoutAll() async {}
}

void main() {
  late List<Override> baseOverrides;

  // "Моё" (docs/04) formats dates and money.
  setUpAll(initializeDateFormatting);

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    baseOverrides = [sharedPreferencesProvider.overrideWithValue(prefs)];
  });

  final themes = {'light': AppTheme.light(), 'dark': AppTheme.dark()};

  Future<void> pump(
    WidgetTester tester,
    Widget child,
    ThemeData theme, {
    List<Override> extra = const [],
    double textScale = 1,
  }) async {
    await tester.pumpWidget(
      uxApp(
        child,
        theme: theme,
        overrides: uxOverrides(extra: [...baseOverrides, ...extra]),
        textScale: textScale,
        // Reduce motion: every entrance renders its final frame at once,
        // so contrast is measured on settled pixels.
        disableAnimations: true,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 500));
  }

  /// Design-system widgets laid out on one scrollable page.
  Widget widgetGallery() => Builder(
        builder: (context) => Scaffold(
          appBar: AppTopBar(
            leading: AppBackButton(semanticLabel: 'Back', onPressed: () {}),
            title: const Text('Gallery'),
          ),
          body: ListView(
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            children: [
              AppButton(label: 'Continue', onPressed: () {}),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: 'Retry',
                variant: AppButtonVariant.secondary,
                height: AppSizes.touchTarget,
                onPressed: () {},
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: 'Delete',
                variant: AppButtonVariant.danger,
                onPressed: () {},
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  AppIconButton(
                    icon: const Icon(AppIcons.mailOutlineRounded),
                    semanticLabel: 'Email',
                    onPressed: () {},
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  AppIconButton(
                    icon: const Icon(Icons.apple),
                    semanticLabel: 'Apple',
                    onPressed: () {},
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                runSpacing: AppSpacing.md,
                children: [
                  AppChip(label: 'DUI', onTap: () {}),
                  AppChip(label: 'Family law', selected: true, onTap: () {}),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              const AppTextField(label: 'Full name', hintText: 'Jane Doe'),
              const SizedBox(height: AppSpacing.md),
              const AppTextField(label: 'Email', errorText: 'Invalid email'),
              const SizedBox(height: AppSpacing.md),
              AppOtpField(
                onCompleted: (_) {},
                autofocus: false,
                semanticLabel: 'Verification code',
              ),
              const SizedBox(height: AppSpacing.md),
              const Row(
                children: [
                  AppAvatar(initials: 'JD', semanticLabel: 'Jane Doe'),
                  SizedBox(width: AppSpacing.md),
                  AppIconMedallion(icon: AppIcons.gavelRounded),
                ],
              ),
              const SizedBox(height: AppSpacing.md),
              const AppCard(child: Text('Plain card')),
              const SizedBox(height: AppSpacing.md),
              AppContentCard(
                leading: const AppAvatar(initials: 'JD'),
                title: 'What to do after a DUI stop',
                meta: 'Jane Doe · Criminal defense',
                body: 'Stay calm and keep your hands visible.',
                tags: const [AppChip(label: '#dui')],
                onTap: () {},
              ),
              const SizedBox(height: AppSpacing.md),
              AppListRow(
                icon: AppIcons.languageRounded,
                label: 'Language',
                onTap: () {},
              ),
              AppListRow(
                icon: AppIcons.deleteOutlineRounded,
                label: 'Delete account',
                destructive: true,
                onTap: () {},
              ),
              const SizedBox(height: AppSpacing.md),
              AppConnectivityBanner(
                message: 'No internet connection',
                actionLabel: 'Retry',
                onAction: () {},
              ),
              const SizedBox(height: AppSpacing.md),
              AppPaginationFooter(
                status: AppPaginationStatus.error,
                labels: const AppPaginationLabels(
                  loadingMore: 'Loading more',
                  error: "Couldn't load more",
                  retry: 'Retry',
                  end: "That's everything",
                ),
                onRetry: () {},
              ),
              AppPaginationFooter(
                status: AppPaginationStatus.end,
                labels: const AppPaginationLabels(
                  loadingMore: 'Loading more',
                  error: "Couldn't load more",
                  retry: 'Retry',
                  end: "That's everything",
                ),
                onRetry: () {},
              ),
              const SizedBox(height: AppSpacing.xxl),
            ],
          ),
          bottomNavigationBar: AppBottomNav(
            tabs: const [
              AppTabConfig(
                key: AppTabKey.feed,
                label: 'Feed',
                icon: AppIcons.homeOutlined,
                activeIcon: AppIcons.homeRounded,
              ),
              AppTabConfig(
                key: AppTabKey.search,
                label: 'Search',
                icon: AppIcons.searchRounded,
                activeIcon: AppIcons.searchRounded,
              ),
              AppTabConfig(
                key: AppTabKey.mine,
                label: 'Mine',
                icon: AppIcons.workOutlineRounded,
                activeIcon: AppIcons.workRounded,
              ),
              AppTabConfig(
                key: AppTabKey.profile,
                label: 'Profile',
                icon: AppIcons.personOutlineRounded,
                activeIcon: AppIcons.personRounded,
              ),
            ],
            currentIndex: 0,
            onTabSelected: (_) {},
            onCreatePressed: () {},
            createSemanticLabel: 'Create',
          ),
        ),
      );

  for (final entry in themes.entries) {
    final name = entry.key;
    final theme = entry.value;

    group('design-system widgets ($name)', () {
      testWidgets('gallery meets tap-target, label and contrast guidelines',
          (tester) async {
        final handle = tester.ensureSemantics();
        await pump(tester, widgetGallery(), theme);
        await expectAccessible(tester);
        await tester.drag(find.byType(ListView), const Offset(0, -600));
        await tester.pump();
        await expectAccessible(tester);
        await tester.drag(find.byType(ListView), const Offset(0, -900));
        await tester.pump();
        await expectAccessible(tester);
        handle.dispose();
      });

      testWidgets('state layouts (empty / error / offline) are accessible',
          (tester) async {
        final handle = tester.ensureSemantics();
        for (final state in <Widget>[
          const AppEmptyState(message: 'Nothing here yet', title: 'Empty'),
          AppErrorState(
            message: "Couldn't load",
            retryLabel: 'Retry',
            onRetry: () {},
          ),
          const AppOfflineState(
            title: "You're offline",
            message: 'Check your internet connection and try again.',
          ),
        ]) {
          await pump(tester, Scaffold(body: state), theme);
          await expectAccessible(tester);
        }
        handle.dispose();
      });
    });

    group('screens ($name)', () {
      final screens = <String, Widget>{
        'feed': const FeedScreen(),
        'search': const SearchScreen(),
        'mine': const MineScreen(),
        'profile': const ProfileScreen(),
        'settings': const SettingsScreen(),
      };
      for (final screen in screens.entries) {
        testWidgets('${screen.key} screen', (tester) async {
          final handle = tester.ensureSemantics();
          await pump(tester, screen.value, theme);
          await expectAccessible(tester);
          handle.dispose();
        });
      }

      final deviceStates = <String, ActiveDevicesRepository>{
        'list': _FakeDevicesRepo(),
        'list with more pages': _FakeDevicesRepo(cursor: 'next'),
        'empty': _FakeDevicesRepo(items: const []),
        'error': _FakeDevicesRepo(
          error: const ApiException(code: 'INTERNAL', message: 'x'),
        ),
        'offline': _FakeDevicesRepo(
          error: const ApiException(
            code: ApiException.networkErrorCode,
            message: 'x',
          ),
        ),
      };
      for (final state in deviceStates.entries) {
        testWidgets('active devices screen: ${state.key}', (tester) async {
          final handle = tester.ensureSemantics();
          await pump(
            tester,
            const ActiveDevicesScreen(),
            theme,
            extra: [
              activeDevicesRepositoryProvider.overrideWithValue(state.value),
            ],
          );
          await expectAccessible(tester);
          handle.dispose();
        });
      }
    });
  }

  group('text scale 200% (docs/01 §8.4)', () {
    testWidgets('feed and active devices lay out without overflow',
        (tester) async {
      for (final screen in <Widget>[
        const FeedScreen(),
        const ActiveDevicesScreen(),
      ]) {
        await pump(
          tester,
          screen,
          AppTheme.light(),
          textScale: 2,
          extra: [
            activeDevicesRepositoryProvider
                .overrideWithValue(_FakeDevicesRepo()),
          ],
        );
        expect(tester.takeException(), isNull);
      }
    });

    testWidgets('widget gallery lays out without overflow', (tester) async {
      await pump(tester, widgetGallery(), AppTheme.dark(), textScale: 2);
      expect(tester.takeException(), isNull);
    });
  });
}

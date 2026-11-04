import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/hosted_settings_sections.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/privacy/privacy_routes.dart';
import 'package:lawbid/features/profile/presentation/screens/desktop_settings.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/settings/about/about_screen.dart';
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/subscription/subscription_routes.dart';
import 'package:lawbid/features/support/application/support_providers.dart';

import '../../helpers/referral_overrides.dart';
import 'profile_fakes.dart';

class _ActivityOn extends ActivityStatusNotifier {
  @override
  Future<bool> build() async => true;
}

final List<Override> _quiet = [
  referralOffOverride,
  promotionsOffOverride,
  partnerOffOverride,
  templatesOffOverride,
  activityStatusProvider.overrideWith(_ActivityOn.new),
  supportUnreadProvider.overrideWithValue(false),
];

const _pane = ValueKey('desktop-profile-pane');

/// Desktop web plan 2026-10-28 §6.5 / §6.7 (PR 4): the profile with a side
/// pane, Settings as sections | section.
void main() {
  setUpAll(initializeDateFormatting);
  tearDown(() => adaptiveShellOverride = null);

  Future<void> pump(
    WidgetTester t,
    Widget child,
    Size size, {
    required CurrentUser user,
    List<Override> extra = const [],
  }) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    adaptiveShellOverride = true;
    final wrap = await profileWrapper(
      AppTheme.light(),
      user: user,
      overrides: [
        ...profileOverrides(
          attorneys: FakeAttorneyRepo(profile: attorneyProfile(isSelf: true)),
        ),
        ..._quiet,
        ...extra,
      ],
    );
    await t.pumpWidget(wrap(child));
    await t.pumpAndSettle();
  }

  late GoRouter router;

  Future<void> pumpRouter(WidgetTester t, String initial, Size size) async {
    router = GoRouter(
      initialLocation: initial,
      routes: [
        GoRoute(
          path: '/profile/settings',
          builder: (_, __) => const SettingsScreen(),
        ),
        for (final path in kSettingsSectionPaths)
          GoRoute(
            path: path,
            builder: (_, state) => SettingsSectionPage(
              location: state.matchedLocation,
              query: state.uri.queryParameters,
              phone: const Text('phone page'),
            ),
          ),
      ],
    );
    addTearDown(router.dispose);
    await pump(
      t,
      Builder(
        builder: (context) => MaterialApp.router(
          theme: AppTheme.light(),
          routerConfig: router,
        ),
      ),
      size,
      user: clientMe(),
    );
  }

  group('profile', () {
    testWidgets('attorney at 1440: the profile and a 320 side pane', (t) async {
      await pump(
        t,
        const ProfileScreen(),
        const Size(1440, 900),
        user: attorneyMe(),
      );
      expect(find.byKey(_pane), findsOneWidget);
      expect(t.getSize(find.byKey(_pane)).width, 320);
      expect(find.textContaining('@jane.doe'), findsOneWidget);
      // One's own profile: the shortcuts are in the pane.
      expect(find.byType(AppListRow), findsNWidgets(3));
      expect(t.takeException(), isNull);
    });

    testWidgets('the 1024 breakpoint: pane at 1024, none at 1023', (t) async {
      await pump(
        t,
        const ProfileScreen(),
        const Size(1024, 800),
        user: attorneyMe(),
      );
      expect(find.byKey(_pane), findsOneWidget);
      await pump(
        t,
        const ProfileScreen(),
        const Size(1023, 800),
        user: attorneyMe(),
      );
      expect(find.byKey(_pane), findsNothing);
    });

    testWidgets('client at 1440: the shortcut pane', (t) async {
      await pump(
        t,
        const ProfileScreen(),
        const Size(1440, 900),
        user: clientMe(),
      );
      expect(find.byKey(_pane), findsOneWidget);
      expect(find.byType(AppListRow), findsNWidgets(3));
      expect(t.takeException(), isNull);
    });

    testWidgets('phone 390 with the web flag on: the profile alone', (t) async {
      await pump(
        t,
        const ProfileScreen(),
        const Size(390, 844),
        user: attorneyMe(),
      );
      expect(find.byKey(_pane), findsNothing);
      expect(find.byType(SupportingPaneLayout), findsNothing);
      expect(find.textContaining('@jane.doe'), findsOneWidget);
      expect(t.takeException(), isNull);
    });
  });

  group('settings', () {
    testWidgets('desktop 1440: the sections list and an empty pane', (t) async {
      await pump(
        t,
        const SettingsScreen(),
        const Size(1440, 900),
        user: clientMe(),
      );
      expect(find.byType(DesktopSettingsPage), findsOneWidget);
      expect(find.byType(ListDetailLayout), findsOneWidget);
      expect(
        find.byKey(const ValueKey('desktop-settings-empty')),
        findsOneWidget,
      );
      expect(
        t.getSize(find.byType(SettingsScreen).last).width,
        kChatListPaneWideWidth,
      );
      expect(t.takeException(), isNull);
    });

    testWidgets('1024: the list is 360 wide', (t) async {
      await pump(
        t,
        const SettingsScreen(),
        const Size(1024, 800),
        user: clientMe(),
      );
      expect(
        t.getSize(find.byType(SettingsScreen).last).width,
        kChatListPaneWidth,
      );
    });

    testWidgets(
        'a hosted row opens in the right pane by its address, back '
        'closes it', (t) async {
      await pumpRouter(t, '/profile/settings', const Size(1440, 900));
      await t.ensureVisible(find.byIcon(AppIcons.infoOutlineRounded));
      await t.pumpAndSettle();
      await t.tap(find.byIcon(AppIcons.infoOutlineRounded));
      await t.pumpAndSettle();
      expect(router.state.matchedLocation, '/profile/settings/about');
      expect(find.byType(AboutScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('desktop-settings-empty')),
        findsNothing,
      );
      expect(
        t.getSize(find.byType(AboutScreen)).width,
        kSettingsDetailMaxWidth,
      );
      // The browser's back closes the section: the empty pane again.
      router.pop();
      await t.pumpAndSettle();
      expect(router.state.matchedLocation, '/profile/settings');
      expect(find.byType(AboutScreen), findsNothing);
      expect(
        find.byKey(const ValueKey('desktop-settings-empty')),
        findsOneWidget,
      );
      expect(t.takeException(), isNull);
    });

    testWidgets('a deep link (or refresh) opens the section in the pane',
        (t) async {
      await pumpRouter(t, '/profile/settings/about', const Size(1440, 900));
      expect(find.byType(DesktopSettingsPage), findsOneWidget);
      expect(find.byType(AboutScreen), findsOneWidget);
      expect(find.byType(SettingsScreen), findsOneWidget);
      expect(t.takeException(), isNull);
    });

    testWidgets('a deep link on a phone is the plain page', (t) async {
      await pumpRouter(t, '/profile/settings/about', const Size(390, 844));
      expect(find.byType(DesktopSettingsPage), findsNothing);
      expect(find.text('phone page'), findsOneWidget);
    });

    // PR 5: the pages that were still pushed are hosted by address too.
    for (final path in [
      AppRoutes.payments,
      SubscriptionRoutes.subscription,
      AppRoutes.support,
      AppRoutes.saved,
      AppRoutes.caseHistory,
    ]) {
      testWidgets('$path: in the pane at 1440, a plain page at 390', (t) async {
        await pumpRouter(t, path, const Size(1440, 900));
        expect(find.byType(DesktopSettingsPage), findsOneWidget);
        expect(find.byType(SettingsScreen), findsOneWidget);
        expect(find.text('phone page'), findsNothing);
        expect(
          find.byKey(const ValueKey('desktop-settings-empty')),
          findsNothing,
        );
        expect(
          find.byKey(ValueKey('desktop-settings-$path-{}')),
          findsOneWidget,
        );
        expect(t.takeException(), isNull);
        await pumpRouter(t, path, const Size(390, 844));
        expect(find.byType(DesktopSettingsPage), findsNothing);
        expect(find.text('phone page'), findsOneWidget);
      });
    }

    testWidgets('Payments keeps its ?tab= in the pane', (t) async {
      await pumpRouter(
        t,
        AppRoutes.paymentsTab('purchases'),
        const Size(1440, 900),
      );
      expect(
        find.byKey(
          const ValueKey(
            'desktop-settings-${AppRoutes.payments}-{tab: purchases}',
          ),
        ),
        findsOneWidget,
      );
      expect(t.takeException(), isNull);
    });

    testWidgets('a dialog from a section opens above the pane, not in it',
        (t) async {
      await pumpRouter(t, '/profile/settings/about', const Size(1440, 900));
      unawaited(
        showDialog<void>(
          context: t.element(find.byType(AboutScreen)),
          builder: (_) => const AlertDialog(content: Text('dialog body')),
        ),
      );
      await t.pumpAndSettle();
      expect(find.text('dialog body'), findsOneWidget);
      expect(
        find.descendant(
          of: find.byType(AboutScreen),
          matching: find.text('dialog body'),
        ),
        findsNothing,
      );
    });

    testWidgets('phone 390 with the web flag on: the plain list', (t) async {
      await pump(
        t,
        const SettingsScreen(),
        const Size(390, 844),
        user: clientMe(),
      );
      expect(find.byType(DesktopSettingsPage), findsNothing);
      expect(find.byType(ListDetailLayout), findsNothing);
      expect(t.takeException(), isNull);
    });
  });

  test('settings and public profile are wide desktop pages', () {
    expect(isSettingsLocation('/profile/settings'), isTrue);
    expect(isSettingsLocation('/profile/settings/devices'), isTrue);
    expect(isSettingsLocation('/profile/settings/payments'), isTrue);
    expect(isSettingsLocation('/profile/settings/support/new'), isFalse);
    expect(isPublicProfileLocation('/lawyer/jane.doe'), isTrue);
    expect(isPublicProfileLocation('/lawyer/jane/x'), isFalse);
    expect(isHostedSettingsRoute('/profile/settings/about'), isTrue);
    expect(isHostedSettingsRoute('/profile/settings/payments'), isTrue);
    expect(isHostedSettingsRoute('/profile/settings/delete-account'), isFalse);
    // PR 5: the rest of the Settings pages are in the pane too, and the
    // pane's registry is exactly the set the shell treats as a wide page.
    expect(kSettingsSectionPaths, {
      AccountRoutes.account,
      ChatRoutes.notificationSettings,
      PrivacyRoutes.privacy,
      AppRoutes.activeDevices,
      AppRoutes.storage,
      AppRoutes.blockedUsers,
      AppRoutes.dataExport,
      AppRoutes.about,
      AppRoutes.payments,
      SubscriptionRoutes.subscription,
      AppRoutes.support,
      AppRoutes.saved,
      AppRoutes.postArchive,
      AppRoutes.caseHistory,
      AppRoutes.referral,
      AppRoutes.partner,
      AppRoutes.bidPacks,
      AppRoutes.stars,
      AppRoutes.clientBadge,
      AppRoutes.myFirm,
      AppRoutes.myStats,
      AppRoutes.myPromotions,
    });
    expect(hostedSettingsSections.keys.toSet(), kSettingsSectionPaths);
    for (final path in kSettingsSectionPaths) {
      expect(isHostedSettingsRoute(path), isTrue);
    }
  });
}

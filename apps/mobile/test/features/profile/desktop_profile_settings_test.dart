import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/presentation/screens/desktop_settings.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/settings/about/about_screen.dart';
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

    testWidgets('a hosted row opens in the right pane, no page is pushed',
        (t) async {
      await pump(
        t,
        const SettingsScreen(),
        const Size(1440, 900),
        user: clientMe(),
      );
      await t.ensureVisible(find.byIcon(AppIcons.infoOutlineRounded));
      await t.pumpAndSettle();
      await t.tap(find.byIcon(AppIcons.infoOutlineRounded));
      await t.pumpAndSettle();
      expect(find.byType(AboutScreen), findsOneWidget);
      expect(
        find.byKey(const ValueKey('desktop-settings-empty')),
        findsNothing,
      );
      expect(find.byType(DesktopSettingsPage), findsOneWidget);
      expect(
        t.getSize(find.byType(AboutScreen)).width,
        kSettingsDetailMaxWidth,
      );
      expect(t.takeException(), isNull);
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
    expect(isSettingsLocation('/profile/settings/devices'), isFalse);
    expect(isPublicProfileLocation('/lawyer/jane.doe'), isTrue);
    expect(isPublicProfileLocation('/lawyer/jane/x'), isFalse);
    expect(isHostedSettingsRoute('/profile/settings/about'), isTrue);
    expect(isHostedSettingsRoute('/profile/settings/payments'), isFalse);
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_side_nav.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Owner 2026-10-15 (web): by window width the menu is the bottom bar
/// (phone), a column of icons, or a column with names; a phone is never
/// touched.
void main() {
  group('shellLayoutFor', () {
    test('phone widths keep the bottom bar', () {
      expect(shellLayoutFor(360, adaptive: true), ShellLayout.bottom);
      expect(shellLayoutFor(599, adaptive: true), ShellLayout.bottom);
    });

    test('tablet widths get a column of icons', () {
      expect(shellLayoutFor(600, adaptive: true), ShellLayout.rail);
      expect(shellLayoutFor(839, adaptive: true), ShellLayout.rail);
    });

    test('laptop widths get names and a centred column', () {
      expect(shellLayoutFor(840, adaptive: true), ShellLayout.extendedRail);
      expect(shellLayoutFor(1600, adaptive: true), ShellLayout.extendedRail);
    });

    test('not adaptive (phones and tests): always the bottom bar', () {
      expect(shellLayoutFor(1600, adaptive: false), ShellLayout.bottom);
    });
  });

  group('AppSideNav', () {
    const tabs = [
      AppTabConfig(
        key: AppTabKey.feed,
        icon: Icons.article_outlined,
        activeIcon: Icons.article,
        label: 'Feed',
      ),
      AppTabConfig(
        key: AppTabKey.search,
        icon: Icons.search,
        activeIcon: Icons.search,
        label: 'Search',
      ),
      AppTabConfig(
        key: AppTabKey.mine,
        icon: Icons.folder_outlined,
        activeIcon: Icons.folder,
        label: 'Mine',
      ),
      AppTabConfig(
        key: AppTabKey.profile,
        icon: Icons.person_outline,
        activeIcon: Icons.person,
        label: 'Profile',
      ),
    ];

    Future<void> pump(
      WidgetTester tester, {
      required bool extended,
      required List<int> taps,
      required VoidCallback onCreate,
      TextDirection dir = TextDirection.ltr,
    }) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.light(),
          builder: (context, child) =>
              Directionality(textDirection: dir, child: child!),
          home: Scaffold(
            body: Row(
              children: [
                AppSideNav(
                  tabs: tabs,
                  currentIndex: 0,
                  onTabSelected: taps.add,
                  onCreatePressed: onCreate,
                  extended: extended,
                ),
                const Expanded(child: SizedBox()),
              ],
            ),
          ),
        ),
      );
    }

    testWidgets('extended: names show, taps select, + creates', (tester) async {
      final taps = <int>[];
      var created = 0;
      await pump(tester, extended: true, taps: taps, onCreate: () => created++);
      expect(find.text('Search'), findsOneWidget);
      expect(tester.getSize(find.byType(AppSideNav)).width, 220);
      await tester.tap(find.byKey(const ValueKey('side-nav-tab-2')));
      await tester.tap(find.byKey(const ValueKey('side-nav-create')));
      expect(taps, [2]);
      expect(created, 1);
    });

    testWidgets('compact: icons only, narrow column', (tester) async {
      await pump(tester, extended: false, taps: [], onCreate: () {});
      expect(find.text('Search'), findsNothing);
      expect(tester.getSize(find.byType(AppSideNav)).width, 76);
    });

    testWidgets('RTL: the column sits on the right', (tester) async {
      await pump(
        tester,
        extended: true,
        taps: [],
        onCreate: () {},
        dir: TextDirection.rtl,
      );
      final left = tester.getTopLeft(find.byType(AppSideNav)).dx;
      expect(left, greaterThan(400));
      expect(tester.takeException(), isNull);
    });
  });
}

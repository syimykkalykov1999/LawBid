import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/app_update/app_version.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/settings/about/about_screen.dart';
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';

/// Owner 17.11 (like WhatsApp / Instagram / Telegram): «Лицензии» is the
/// last row of «О приложении» (app and web share this screen) and opens
/// Flutter's standard licence page with the app's name and version.
void main() {
  testWidgets('the last About row opens the licence page', (tester) async {
    await tester.pumpWidget(
      uxApp(
        const AboutScreen(),
        theme: AppTheme.light(),
        overrides: uxOverrides(),
        disableAnimations: true,
      ),
    );
    await tester.pump(const Duration(seconds: 7));

    final row = find.byKey(const ValueKey('about-licenses'));
    await tester.scrollUntilVisible(row, 200);
    expect(row, findsOneWidget);
    expect(find.byType(AppListRow), findsWidgets);
    // The very bottom: no other row below it.
    final rows = tester.widgetList<AppListRow>(find.byType(AppListRow));
    expect(rows.last.key, const ValueKey('about-licenses'));

    await tester.ensureVisible(row);
    await tester.pump();
    await tester.tap(row);
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.byType(LicensePage), findsOneWidget);
    expect(find.text('LawBid'), findsWidgets);
    expect(find.text(AppVersion.current), findsWidgets);
  });
}

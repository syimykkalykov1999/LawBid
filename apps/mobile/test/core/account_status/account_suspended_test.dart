import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/account_status/account_suspended.dart';
import 'package:lawbid/core/design_system/design_system.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-02: a blocked account sees why and until when.
void main() {
  setUpAll(initializeDateFormatting);

  testWidgets('shows the reason and the end date over the app', (tester) async {
    await tester.pumpWidget(
      uxApp(
        const AccountSuspendedGate(child: Scaffold(body: Text('the app'))),
        size: const Size(800, 1600),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [
            suspensionProvider.overrideWith(_Suspended.new),
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('Account blocked'), findsOneWidget);
    expect(find.textContaining('Spam in comments'), findsOneWidget);
    expect(find.textContaining('The block lasts until'), findsOneWidget);
    expect(find.text('Contact support'), findsOneWidget);
  });

  testWidgets('not blocked: the app is shown as is', (tester) async {
    await tester.pumpWidget(
      uxApp(
        const AccountSuspendedGate(child: Scaffold(body: Text('the app'))),
        size: const Size(800, 1600),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('the app'), findsOneWidget);
    expect(find.text('Account blocked'), findsNothing);
  });
}

class _Suspended extends SuspensionController {
  @override
  SuspensionInfo? build() => SuspensionInfo(
        reason: 'Spam in comments',
        until: DateTime.utc(2026, 11),
      );
}

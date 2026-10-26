import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/connectivity/offline_banner_host.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_routes.dart';

import '../../helpers/ux_harness.dart';

/// Stateful child: proves the banner never re-creates the page below it.
class _Counter extends StatefulWidget {
  const _Counter();

  @override
  State<_Counter> createState() => _CounterState();
}

class _CounterState extends State<_Counter> {
  int taps = 0;

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Scaffold(
      body: Column(
        children: [
          Text('top=$top', key: const Key('top')),
          TextButton(
            onPressed: () => setState(() => taps++),
            child: Text('taps=$taps'),
          ),
        ],
      ),
    );
  }
}

void main() {
  late FakeNetworkMonitor monitor;
  late FakeProbe probe;
  late ProviderContainer container;

  Future<void> pumpHost(
    WidgetTester tester, {
    bool enabled = true,
    bool disableAnimations = false,
    EdgeInsets padding = const EdgeInsets.only(top: 47),
    bool networkUp = true,
  }) async {
    monitor = FakeNetworkMonitor(up: networkUp);
    probe = FakeProbe();
    await tester.pumpWidget(
      uxApp(
        Builder(
          builder: (context) {
            container = ProviderScope.containerOf(context);
            return OfflineBannerHost(enabled: enabled, child: const _Counter());
          },
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(monitor: monitor, probe: probe),
        disableAnimations: disableAnimations,
        padding: padding,
      ),
    );
    await tester.pumpAndSettle();
  }

  String topText(WidgetTester tester) =>
      tester.widget<Text>(find.byKey(const Key('top'))).data!;

  testWidgets(
    'owner 2026-10-22: no connectivity banner is ever shown to users',
    (tester) async {
      await pumpHost(tester);
      expect(find.byType(AppConnectivityBanner), findsNothing);
      monitor.set(false);
      await tester.pumpAndSettle();
      expect(find.byType(AppConnectivityBanner), findsNothing);
      expect(find.text('No internet connection'), findsNothing);
      container.read(reachabilitySignalProvider).markUnreachable();
      await tester.pumpAndSettle();
      expect(find.text("Can't reach LawBid right now"), findsNothing);
      expect(find.text('Retry'), findsNothing);
      expect(topText(tester), 'top=47.0');
    },
  );

  test('isInAppLocation: shell tabs and pushed in-app screens only', () {
    for (final path in [
      AppRoutes.feed,
      AppRoutes.search,
      AppRoutes.mine,
      AppRoutes.profile,
      AppRoutes.create,
      AppRoutes.profileSettings,
      AppRoutes.activeDevices,
    ]) {
      expect(isInAppLocation(path), isTrue, reason: path);
    }
    for (final path in [
      AppRoutes.splash,
      '/welcome',
      '/auth/phone',
      '/onboarding/role',
      AppRoutes.legalDoc('terms'),
      AppRoutes.verification,
      '/feedback',
    ]) {
      expect(isInAppLocation(path), isFalse, reason: path);
    }
  });
}

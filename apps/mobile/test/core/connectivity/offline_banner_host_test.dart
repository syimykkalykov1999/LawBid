import 'dart:async';

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

  testWidgets('online: no banner, page keeps the status-bar inset',
      (tester) async {
    await pumpHost(tester);
    expect(find.byType(AppConnectivityBanner), findsNothing);
    expect(topText(tester), 'top=47.0');
  });

  testWidgets(
      'no network: banner slides in, announces itself, and takes over the '
      'status-bar inset', (tester) async {
    await pumpHost(tester);
    monitor.set(false);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));
    // Mid-animation: the page's inset shrinks as the banner grows.
    expect(find.byType(AppConnectivityBanner), findsOneWidget);
    await tester.pumpAndSettle();

    expect(find.text('No internet connection'), findsOneWidget);
    expect(topText(tester), 'top=0.0');
    final banner = tester.getRect(find.byType(AppConnectivityBanner));
    expect(banner.top, 0);
    expect(banner.height, greaterThan(47 + AppSizes.bannerMinHeight - 1));

    final node = tester.getSemantics(find.text('No internet connection'));
    expect(node.getSemanticsData().flagsCollection.isLiveRegion, isTrue);
  });

  testWidgets('server unreachable shows its own message', (tester) async {
    await pumpHost(tester);
    container.read(reachabilitySignalProvider).markUnreachable();
    await tester.pumpAndSettle();
    expect(find.text("Can't reach LawBid right now"), findsOneWidget);
  });

  testWidgets(
      'Retry probes, shows "Back online", then collapses after the hold',
      (tester) async {
    await pumpHost(tester);
    container.read(reachabilitySignalProvider).markUnreachable();
    await tester.pumpAndSettle();

    probe
      ..result = true
      ..hold = Completer<void>();
    await tester.tap(find.bySemanticsLabel('Retry'));
    await tester.pump();
    expect(find.bySemanticsLabel('Checking the connection'), findsOneWidget);
    probe.hold!.complete();
    await tester.pumpAndSettle();

    expect(probe.calls, greaterThanOrEqualTo(1));
    expect(find.text('Back online'), findsOneWidget);

    await tester.pump(AppMotion.restoredHold);
    await tester.pumpAndSettle();
    expect(find.byType(AppConnectivityBanner), findsNothing);
    expect(topText(tester), 'top=47.0');
  });

  testWidgets('the page below is never re-created by the banner',
      (tester) async {
    await pumpHost(tester);
    await tester.tap(find.text('taps=0'));
    await tester.pump();
    monitor.set(false);
    await tester.pumpAndSettle();
    monitor.set(true);
    await tester.pumpAndSettle();
    await tester.pump(AppMotion.restoredHold);
    await tester.pumpAndSettle();
    expect(find.text('taps=1'), findsOneWidget);
  });

  testWidgets('disabled (pre-app routes): offline shows no banner',
      (tester) async {
    await pumpHost(tester, enabled: false, networkUp: false);
    expect(find.byType(AppConnectivityBanner), findsNothing);
    expect(topText(tester), 'top=47.0');
  });

  testWidgets('reduce motion: banner appears without animating',
      (tester) async {
    await pumpHost(tester, disableAnimations: true);
    monitor.set(false);
    // Status event → banner built → its measured height applied: three
    // plain frames, no animation ticking in between.
    for (var i = 0; i < 3; i++) {
      await tester.pump();
      expect(tester.hasRunningAnimations, isFalse);
    }
    expect(tester.hasRunningAnimations, isFalse);
    expect(find.text('No internet connection'), findsOneWidget);
    expect(topText(tester), 'top=0.0');
  });

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

  testWidgets('banner semantics: Retry is a labelled 48dp button',
      (tester) async {
    await pumpHost(tester, networkUp: false);
    final handle = tester.ensureSemantics();
    await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
    await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
    handle.dispose();
    expect(
      tester.getSemantics(find.bySemanticsLabel('Retry')),
      matchesSemantics(
        label: 'Retry',
        isButton: true,
        hasTapAction: true,
        hasEnabledState: true,
        isEnabled: true,
      ),
    );
  });
}

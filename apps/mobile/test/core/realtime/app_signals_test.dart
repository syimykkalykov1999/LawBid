import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/platform/page_signals_stub.dart';
import 'package:lawbid/core/realtime/app_signals.dart';

import '../../helpers/ux_harness.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeNetworkMonitor monitor;
  late StreamController<PageSignal> page;
  late AppSignals signals;
  late List<AppSignal> seen;

  setUp(() {
    monitor = FakeNetworkMonitor(up: true);
    page = StreamController<PageSignal>.broadcast();
    signals = AppSignals(monitor: monitor, pageSignals: page.stream)..start();
    seen = [];
    signals.signals.listen(seen.add);
  });

  tearDown(() async {
    signals.dispose();
    await monitor.close();
    await page.close();
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('app lifecycle: paused then resumed', () async {
    signals
      ..didChangeAppLifecycleState(AppLifecycleState.paused)
      ..didChangeAppLifecycleState(AppLifecycleState.inactive)
      ..didChangeAppLifecycleState(AppLifecycleState.resumed);
    await settle();
    expect(seen, [AppSignal.paused, AppSignal.resumed]);
    expect(signals.foreground, isTrue);
  });

  test('browser tab: visibilitychange and online map to the same signals',
      () async {
    page
      ..add(PageSignal.hidden)
      ..add(PageSignal.visible)
      ..add(PageSignal.online);
    await settle();
    expect(seen, [
      AppSignal.paused,
      AppSignal.resumed,
      AppSignal.networkBack,
    ]);
  });

  test('network returning (interface up) is a network-back signal', () async {
    monitor.set(false);
    await settle();
    expect(seen, isEmpty);
    monitor.set(true);
    await settle();
    expect(seen, [AppSignal.networkBack]);
  });
}

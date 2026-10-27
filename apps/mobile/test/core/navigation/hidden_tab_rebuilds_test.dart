import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/time/shown_tick.dart';

/// 2026-10-26 (smoothness P7): a tab hidden in the shell's
/// `StatefulShellRoute.indexedStack` does not rebuild — neither from a live
/// provider (Riverpod pauses a consumer under `TickerMode(enabled: false)`,
/// which go_router puts around every hidden branch) nor from a clock tick
/// ([ShownTick]) — and catches up once when it is shown again.
class _Counter extends Notifier<int> {
  @override
  int build() => 0;
  void bump() => state++;
}

final _counter = NotifierProvider<_Counter, int>(_Counter.new);

var _watchBuilds = 0;
var _tickBuilds = 0;

class _Watcher extends ConsumerWidget {
  const _Watcher();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    _watchBuilds++;
    return Text('value ${ref.watch(_counter)}');
  }
}

class _Ticker extends StatefulWidget {
  const _Ticker();

  @override
  State<_Ticker> createState() => _TickerState();
}

class _TickerState extends State<_Ticker> with ShownTick<_Ticker> {
  late final Timer _timer;
  var _ticks = 0;
  var _caughtUp = 0;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(
      const Duration(seconds: 1),
      (_) => shownTick(() => _ticks++),
    );
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (trackShown(context)) _caughtUp++;
    _tickBuilds++;
    return Text('ticks $_ticks caught $_caughtUp');
  }
}

void main() {
  late StatefulNavigationShell shell;

  Widget app() {
    final router = GoRouter(
      initialLocation: '/a',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, navigationShell) {
            shell = navigationShell;
            return Scaffold(body: navigationShell);
          },
          branches: [
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/a',
                  builder: (_, __) =>
                      const Column(children: [_Watcher(), _Ticker()]),
                ),
              ],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(path: '/b', builder: (_, __) => const Text('tab b')),
              ],
            ),
          ],
        ),
      ],
    );
    return ProviderScope(child: MaterialApp.router(routerConfig: router));
  }

  testWidgets('a hidden tab does not rebuild; it catches up when shown',
      (tester) async {
    _watchBuilds = 0;
    _tickBuilds = 0;
    await tester.pumpWidget(app());
    await tester.pumpAndSettle();
    final container = ProviderScope.containerOf(
      tester.element(find.byType(_Watcher)),
    );

    // Shown: a provider change and a tick both rebuild.
    container.read(_counter.notifier).bump();
    await tester.pump(const Duration(seconds: 1));
    expect(find.text('value 1'), findsOneWidget);
    expect(find.text('ticks 1 caught 0'), findsOneWidget);

    // Hide tab A.
    shell.goBranch(1);
    await tester.pumpAndSettle();
    expect(find.text('tab b'), findsOneWidget);
    final watchHidden = _watchBuilds;
    final tickHidden = _tickBuilds;

    for (var i = 0; i < 5; i++) {
      container.read(_counter.notifier).bump();
      await tester.pump(const Duration(seconds: 1));
    }
    expect(_watchBuilds, watchHidden, reason: 'provider rebuilt a hidden tab');
    expect(_tickBuilds, tickHidden, reason: 'clock rebuilt a hidden tab');

    // Shown again: one catch-up rebuild each, with the latest values.
    shell.goBranch(0);
    await tester.pumpAndSettle();
    expect(find.text('value 6'), findsOneWidget);
    expect(find.textContaining('caught 1'), findsOneWidget);
    expect(_watchBuilds - watchHidden, lessThanOrEqualTo(2));
    expect(_tickBuilds - tickHidden, lessThanOrEqualTo(2));

    // And it ticks again while shown.
    final before = _tickBuilds;
    await tester.pump(const Duration(seconds: 1));
    expect(_tickBuilds, before + 1);

    await tester.pumpWidget(const SizedBox());
  });
}

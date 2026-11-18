import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/static_strings_assets.dart';
import 'package:lawbid/core/l10n/static_strings_web.dart' as web;

import 'l10n_test_harness.dart';

/// Web bundle budget (17.11): on the web the built-in ru/en strings are
/// assets (lib/core/l10n/static_strings.dart). run_app.dart awaits
/// `L10nCacheController.builtInStringsReady()` before `runApp`, with no
/// timeout, so no frame is drawn while they are pending and the first frame
/// never shows a raw key. This runs that same step with the web loader and a
/// slow / failing network, and pumps frames the whole time.
void main() {
  final assets = {
    for (final code in kBuiltInStringLanguages)
      builtInStringsAsset(code):
          File(builtInStringsAsset(code)).readAsStringSync(),
  };
  final ruFeed =
      decodeBuiltInStrings(assets[builtInStringsAsset('ru')]!)['nav.tab.feed']!;

  late List<String> reads;
  setUp(() {
    web.resetBuiltInStrings();
    reads = [];
  });

  /// The start of run_app.dart: `builtInStringsReady()`, then runApp. The
  /// app is mounted only once [ready] has completed (as runApp is).
  Future<void> mountApp(WidgetTester tester, ProviderContainer container) =>
      tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: Consumer(
            builder: (context, ref, _) => Text(
              ref.watch(translatorProvider).t('nav.tab.feed'),
              textDirection: TextDirection.ltr,
            ),
          ),
        ),
      );

  Future<ProviderContainer> russianWeb() async {
    final h = await L10nHarness.create();
    h.api.offline = true;
    return h.container(
      systemLocales: const [Locale('ru', 'RU')],
      extra: [
        builtInStringsWaitProvider.overrideWithValue(web.waitForBuiltInStrings),
      ],
    );
  }

  testWidgets('a slow read: no frame until the strings are in memory',
      (tester) async {
    final pending = <String, Completer<String>>{};
    web.readBuiltInStringsAsset = (asset) {
      reads.add(asset);
      return (pending[asset] = Completer<String>()).future;
    };
    final container = await tester.runAsync(russianWeb);
    var started = false;
    unawaited(
      container!
          .read(l10nCacheControllerProvider.notifier)
          .builtInStringsReady()
          .then((_) => started = true),
    );

    // 20 s of frames on a slow link: nothing drawn, no raw key anywhere.
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(seconds: 1));
      expect(started, isFalse);
      expect(find.byType(UncontrolledProviderScope), findsNothing);
      expect(find.text('nav.tab.feed'), findsNothing);
    }
    expect(web.builtInStrings('ru'), isNull);
    expect(
      reads,
      containsAll([builtInStringsAsset('en'), builtInStringsAsset('ru')]),
    );

    for (final e in pending.entries) {
      e.value.complete(assets[e.key]);
    }
    await tester.pump();
    expect(started, isTrue);
    await mountApp(tester, container);
    expect(find.text(ruFeed), findsOneWidget);
    expect(find.text('nav.tab.feed'), findsNothing);
  });

  testWidgets('a failing network: tried again with pauses, splash stays',
      (tester) async {
    var failuresLeft = 3;
    web.readBuiltInStringsAsset = (asset) async {
      reads.add(asset);
      if (asset.endsWith('_ru.json') && failuresLeft-- > 0) {
        throw const SocketException('offline');
      }
      return assets[asset]!;
    };
    final container = await tester.runAsync(russianWeb);
    var started = false;
    unawaited(
      container!
          .read(l10nCacheControllerProvider.notifier)
          .builtInStringsReady()
          .then((_) => started = true),
    );

    // Pauses 0.5 + 1 + 2 s before the 4th read succeeds: no frame before.
    for (var i = 0; i < 34; i++) {
      await tester.pump(const Duration(milliseconds: 100));
      expect(started, isFalse);
      expect(find.byType(UncontrolledProviderScope), findsNothing);
    }
    await tester.pump(const Duration(milliseconds: 200));
    expect(started, isTrue);
    await mountApp(tester, container);
    expect(reads.where((r) => r.endsWith('_ru.json')), hasLength(4));
    expect(find.text(ruFeed), findsOneWidget);
    expect(find.text('nav.tab.feed'), findsNothing);
  });

  test('after the last try the start goes on (cached translations answer)',
      () async {
    web.readBuiltInStringsAsset = (asset) async {
      reads.add(asset);
      throw const SocketException('offline');
    };
    final ok = await web.waitForBuiltInStrings(
      'en',
      retryDelays: const [Duration.zero, Duration.zero],
    );
    expect(ok, isFalse);
    expect(reads, hasLength(3));
    expect(kBuiltInStringsRetryDelays, isNotEmpty);
  });
}

import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/back_swipe.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';

import 'fixtures/deferred_fixture_screen.dart' deferred as d_first;
import 'fixtures/deferred_fixture_screen.dart' deferred as d_second;

var _cachedLoads = 0;
Future<void> _cachedLoad() async => _cachedLoads++;
Widget _cachedBuilder(BuildContext _) => const Text('cached');

Widget _host(Widget child) => ProviderScope(
      child: MaterialApp(
        theme: AppTheme.light(),
        home: child,
      ),
    );

void main() {
  testWidgets('shows the screen once its library has loaded', (tester) async {
    final gate = Completer<void>();
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          id: 'test_ok',
          load: () => gate.future,
          builder: (_) => const Text('screen'),
        ),
      ),
    );
    expect(find.text('screen'), findsNothing);
    gate.complete();
    await tester.pump();
    await tester.pump();
    expect(find.text('screen'), findsOneWidget);
  });

  testWidgets('a loader that already finished builds on the first frame', (
    tester,
  ) async {
    await DeferredScreen.prefetch('test_cached', _cachedLoad);
    final before = _cachedLoads;
    await tester.pumpWidget(
      _host(
        const DeferredScreen(
          id: 'test_cached',
          load: _cachedLoad,
          builder: _cachedBuilder,
        ),
      ),
    );
    expect(find.text('cached'), findsOneWidget);
    expect(_cachedLoads, before);
  });

  testWidgets('the same id with ANOTHER loader is not trusted from the cache',
      (tester) async {
    await DeferredScreen.prefetch('test_same_id', _cachedLoad);
    var loads = 0;
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          id: 'test_same_id',
          load: () async => loads++,
          builder: (_) => const Text('other'),
        ),
      ),
    );
    // First frame: only the page colour — this loader has not run yet.
    expect(find.text('other'), findsNothing);
    await tester.pump();
    expect(find.text('other'), findsOneWidget);
    expect(loads, 1);
  });

  testWidgets(
      'owner bug 2026-10-28: one library under two deferred prefixes with '
      'the same id — the second route still loads its own prefix', (
    tester,
  ) async {
    // First route (like chat_routes) loads ITS prefix.
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          id: 'archive_screen',
          load: d_first.loadLibrary,
          builder: (_) => d_first.DeferredFixtureScreen(label: 'first'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.text('first'), findsOneWidget);

    // Second route (like app_router) with the same id but another prefix:
    // before the fix this built without d_second.loadLibrary() and threw
    // in _checkLoaded (grey error screen in release).
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          key: const ValueKey('second'),
          id: 'archive_screen',
          load: d_second.loadLibrary,
          builder: (_) => d_second.DeferredFixtureScreen(label: 'second'),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.text('second'), findsOneWidget);
  });

  testWidgets('a failed load offers a retry that loads again', (tester) async {
    var calls = 0;
    await tester.pumpWidget(
      _host(
        DeferredScreen(
          id: 'test_retry',
          load: () async {
            calls++;
            if (calls == 1) throw StateError('offline');
          },
          builder: (_) => const Text('back online'),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.byType(AppButton), findsOneWidget);
    await tester.tap(find.byType(AppButton));
    await tester.pump();
    await tester.pump();
    expect(find.text('back online'), findsOneWidget);
    expect(calls, 2);
  });

  for (final dark in [false, true]) {
    testWidgets(
        'owner 2026-10-28: the loading placeholder is the theme page colour '
        '(dark: $dark), never white', (tester) async {
      final theme = dark ? AppTheme.dark() : AppTheme.light();
      final gate = Completer<void>();
      await tester.pumpWidget(
        ProviderScope(
          child: MaterialApp(
            theme: theme,
            home: DeferredScreen(
              id: 'test_colour',
              load: () => gate.future,
              builder: (_) => const Text('x'),
            ),
          ),
        ),
      );
      final box = tester.widget<ColoredBox>(
        find.byKey(const ValueKey('deferred-placeholder')),
      );
      expect(box.color, theme.scaffoldBackgroundColor);
      gate.complete();
      await tester.pump();
    });

    testWidgets(
        'owner 2026-10-28: a pushed page sits on the theme page colour '
        '(dark: $dark) while its first frame paints nothing', (tester) async {
      final base = dark ? AppTheme.dark() : AppTheme.light();
      final theme = base.copyWith(pageTransitionsTheme: kBackSwipeTransitions);
      final nav = GlobalKey<NavigatorState>();
      await tester.pumpWidget(
        MaterialApp(
          navigatorKey: nav,
          theme: theme,
          home: const SizedBox.shrink(),
        ),
      );
      unawaited(
        nav.currentState!.push(
          MaterialPageRoute<void>(
            builder: (_) => const SizedBox.shrink(key: ValueKey('empty')),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 16));
      final bg = find.ancestor(
        of: find.byKey(const ValueKey('empty')),
        matching: find.byType(PageBackground),
      );
      expect(bg, findsOneWidget);
      final box = tester.widget<ColoredBox>(
        find.descendant(of: bg, matching: find.byType(ColoredBox)).first,
      );
      expect(box.color, theme.scaffoldBackgroundColor);
      await tester.pumpAndSettle();
    });
  }

  test(
      'every DeferredScreen loads and builds from the same deferred prefix, '
      'and each id belongs to one prefix only', () {
    final idOwners = <String, Set<String>>{};
    final problems = <String>[];
    final files = Directory('lib')
        .listSync(recursive: true)
        .whereType<File>()
        .where((f) => f.path.endsWith('.dart'));
    final deferredRe = RegExp(r'deferred as (\w+);');
    final blockRe = RegExp(
      r"DeferredScreen\(\s*id: '([^']+)',\s*load: (\w+)\.loadLibrary,"
      r'\s*builder: ([\s\S]*?)\n\s*\),',
    );
    var screens = 0;
    for (final f in files) {
      final src = f.readAsStringSync();
      if (!src.contains('DeferredScreen(')) continue;
      final prefixes = {
        for (final m in deferredRe.allMatches(src)) m.group(1)!,
      };
      final all = 'DeferredScreen('.allMatches(src).length;
      final blocks = blockRe.allMatches(src).toList();
      if (f.path.endsWith('deferred_screen.dart')) continue;
      if (blocks.length != all) {
        problems.add('${f.path}: a DeferredScreen not in the id/load/builder '
            'shape this guard can check');
      }
      for (final m in blocks) {
        screens++;
        final id = m.group(1)!;
        final prefix = m.group(2)!;
        if (!prefixes.contains(prefix)) {
          problems.add('${f.path}: $id loads $prefix, not a deferred prefix');
        }
        for (final used in RegExp(r'\b(d_\w+)\.').allMatches(m.group(3)!)) {
          if (used.group(1) != prefix) {
            problems.add(
              '${f.path}: $id loads $prefix but builds ${used.group(1)}',
            );
          }
        }
        idOwners.putIfAbsent(id, () => {}).add('${f.path}#$prefix');
      }
    }
    for (final e in idOwners.entries) {
      if (e.value.length > 1) {
        problems.add('id ${e.key} is shared by prefixes ${e.value}');
      }
    }
    expect(screens, greaterThan(50));
    expect(problems, isEmpty);
  });
}

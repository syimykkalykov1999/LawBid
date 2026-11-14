import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/app.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Perf batch 4 (row 127): the network-usage counter ticks on every
/// response; the app root must keep it alive without rebuilding on it.
class _Root extends ConsumerWidget {
  const _Root(this.builds);

  final List<int> builds;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    builds.add(1);
    keepNetworkUsageCounted(ref);
    return const SizedBox();
  }
}

void main() {
  testWidgets('40 requests counted, the root built once', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final sp = await SharedPreferences.getInstance();
    final container = ProviderContainer(
      overrides: [sharedPreferencesProvider.overrideWithValue(sp)],
    );
    addTearDown(container.dispose);
    final builds = <int>[];
    await tester.pumpWidget(
      UncontrolledProviderScope(container: container, child: _Root(builds)),
    );
    final counter = container.read(networkUsageCounterProvider);
    for (var i = 0; i < 40; i++) {
      counter.request(bytes: 100);
      await tester.pump();
    }
    expect(builds, hasLength(1));
    // Still counted (the provider is alive): «за сегодня» is right.
    expect(container.read(networkUsageTodayProvider).requests, 40);
    await tester.pump(const Duration(seconds: 6)); // the 5 s save timer
  });

  test('LawBidApp does not watch the counter', () {
    final source = File('lib/app.dart').readAsStringSync();
    expect(source, isNot(contains('watch(networkUsageTodayProvider)')));
    expect(source, contains('keepNetworkUsageCounted(ref);'));
  });
}

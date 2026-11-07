import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart' show ProviderScope;
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';
import 'package:lawbid/features/settings/storage/presentation/storage_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (client economy plan §5.2): «Данные и память» shows
/// what each store takes, «Очистить» empties it (and all of them), the
/// user may lower a limit but never raise it over the administrator's
/// ceiling.
class _Flags extends FeatureFlagsController {
  _Flags(this.config);

  final Map<String, String> config;

  @override
  FeatureFlagsState build() =>
      FeatureFlagsState(flags: defaultFeatureFlags, appConfig: config);

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

void main() {
  late CacheDatabase cache;

  setUp(() async {
    driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
    cache = CacheDatabase(NativeDatabase.memory());
    await cache.putHttpEntry(
      key: 'k',
      etag: 'e',
      json: 'x' * 2048,
      bytes: 2048,
      now: DateTime(2026),
    );
    await cache.putMessages(
      'me',
      'c1',
      [(id: 'm1', createdAt: DateTime(2026), json: 'y' * 4096)],
    );
  });
  tearDown(() => cache.close());

  Future<List<Override>> overrides({
    Map<String, String> config = const {},
    Map<String, Object> prefs = const {},
  }) async {
    SharedPreferences.setMockInitialValues(prefs);
    final sp = await SharedPreferences.getInstance();
    return uxOverrides(
      extra: [
        sharedPreferencesProvider.overrideWithValue(sp),
        cacheDatabaseProvider.overrideWithValue(cache),
        featureFlagsControllerProvider.overrideWith(() => _Flags(config)),
      ],
    );
  }

  Future<void> pump(WidgetTester t, List<Override> o) async {
    await t.pumpWidget(
      uxApp(const StorageScreen(), theme: AppTheme.light(), overrides: o),
    );
    await t.pumpAndSettle();
  }

  testWidgets('shows the ring total and the four categories with sizes',
      (t) async {
    await pump(t, await overrides());
    expect(find.text('Data and storage'), findsOneWidget);
    expect(find.text('6 KB'), findsNWidgets(2)); // ring + «Other»
    for (final c in StorageCategory.values) {
      expect(find.byKey(ValueKey('storage-cat-${c.name}')), findsOneWidget);
    }
    expect(find.text('Documents and case files'), findsOneWidget);
    expect(find.text('Clear entire cache 6 KB'), findsOneWidget);
    await t.scrollUntilVisible(find.text('Requests: 0'), 200);
    expect(find.text('Requests: 0'), findsOneWidget);
  });

  testWidgets('clearing only the ticked categories leaves the rest', (t) async {
    await pump(t, await overrides());
    // Untick «Other» (messages and requests): only the others are cleared.
    await t.tap(find.byKey(const ValueKey('storage-cat-other')));
    await t.pumpAndSettle();
    expect(find.text('Clear selected 0 KB'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('storage-cat-other')));
    await t.tap(find.byKey(const ValueKey('storage-cat-video')));
    await t.tap(find.byKey(const ValueKey('storage-cat-photos')));
    await t.tap(find.byKey(const ValueKey('storage-cat-documents')));
    await t.pumpAndSettle();
    expect(find.text('Clear selected 6 KB'), findsOneWidget);
    await t.tap(find.byKey(const ValueKey('storage-clear-all')));
    await t.pumpAndSettle();
    expect(
      find.textContaining('Chat history on this phone'),
      findsOneWidget,
    );
    await t.tap(find.byKey(const ValueKey('storage-clear-confirm')));
    await t.pumpAndSettle();
    expect(await cache.messagesBytes(), 0);
    expect(await cache.httpBytes(), 0);
    expect(find.text('Cache cleared'), findsOneWidget);
  });

  testWidgets('unticked categories are not cleared', (t) async {
    await pump(t, await overrides());
    await t.tap(find.byKey(const ValueKey('storage-cat-other')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('storage-clear-all')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('storage-clear-confirm')));
    await t.pumpAndSettle();
    expect(await cache.messagesBytes(), greaterThan(0));
    expect(await cache.httpBytes(), greaterThan(0));
  });

  testWidgets('«Clear entire cache» empties everything but keeps the outbox',
      (t) async {
    await pump(t, await overrides());
    final social = ProviderScope.containerOf(
      t.element(find.byType(StorageScreen)),
    ).read(socialLocalDatabaseProvider);
    await social.savePage('feed:me', 'z' * 1024);
    await social.enqueue(
      clientMessageId: 'out-1',
      ownerId: 'me',
      conversationId: 'c1',
      body: 'not sent yet',
    );
    await t.tap(find.byKey(const ValueKey('storage-clear-all')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('storage-clear-confirm')));
    await t.pumpAndSettle();
    expect(await cache.messagesBytes(), 0);
    expect(await cache.httpBytes(), 0);
    expect(await social.pagesBytes(), 0);
    expect((await social.pending('me')).length, 1, reason: 'outbox stays');
    expect(find.text('Cache cleared'), findsOneWidget);
  });

  testWidgets(
      'auto-delete defaults: private never, groups 1 month, feed 1 week',
      (t) async {
    await pump(t, await overrides());
    for (final (scope, label) in [
      (AutoDeleteScope.privateChats, 'Never'),
      (AutoDeleteScope.groups, '1 month'),
      (AutoDeleteScope.feed, '1 week'),
    ]) {
      final row = find.byKey(ValueKey('storage-auto-${scope.key}'));
      await t.scrollUntilVisible(row, 200);
      expect(
        find.descendant(of: row, matching: find.text(label)),
        findsOneWidget,
        reason: scope.name,
      );
    }
  });

  testWidgets('auto-delete offers Never / 3 days / 1 week / 1 month',
      (t) async {
    await pump(t, await overrides());
    final row = find.byKey(const ValueKey('storage-auto-groups'));
    await t.scrollUntilVisible(row, 200);
    await t.ensureVisible(row);
    await t.pumpAndSettle();
    await t.tap(row);
    await t.pumpAndSettle();
    for (final a in AutoDeleteAge.values) {
      expect(
        find.byKey(ValueKey('storage-auto-opt-${a.name}')),
        findsOneWidget,
      );
    }
    await t.tap(find.byKey(const ValueKey('storage-auto-opt-threeDays')));
    await t.pumpAndSettle();
    expect(
      find.descendant(of: row, matching: find.text('3 days')),
      findsOneWidget,
    );
  });

  testWidgets('the cap slider starts at 10 GB and stops at 5 / 10 / 30 / none',
      (t) async {
    await pump(t, await overrides());
    final slider = find.byKey(const ValueKey('storage-cap-slider'));
    await t.scrollUntilVisible(slider, 200);
    await t.ensureVisible(slider);
    await t.pumpAndSettle();
    expect(t.widget<Slider>(slider).value, 1, reason: '10 GB is stop 1');
    for (final label in ['5 GB', '10 GB', '30 GB', 'No limit']) {
      expect(find.text(label), findsOneWidget);
    }
    final container = ProviderScope.containerOf(t.element(slider));
    expect(container.read(cacheLimitsProvider).capMb, 10 * 1024);
    // Drag to the far right: «No limit».
    await t.drag(slider, const Offset(600, 0));
    await t.pumpAndSettle();
    expect(container.read(cacheLimitsProvider).capBytes, isNull);
    expect(t.widget<Slider>(slider).value, 3);
  });
}

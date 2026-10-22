import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart' show ProviderScope;
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_limits.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/settings/storage/presentation/storage_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (client economy plan §5.2): «Данные и память» shows
/// what each store takes, «Очистить» empties it (and all of them), the
/// user may lower a limit but never raise it over the administrator's
/// ceiling, and «Хранить медиа» offers the four Telegram choices.
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

  testWidgets('shows every store with its size and the total', (t) async {
    await pump(t, await overrides());
    expect(find.text('Data and storage'), findsOneWidget);
    expect(find.text('6 KB used'), findsOneWidget);
    expect(find.text('2 KB'), findsOneWidget); // request cache
    expect(find.text('4 KB'), findsOneWidget); // messages
    await t.scrollUntilVisible(find.text('Requests: 0'), 200);
    expect(find.text('Requests: 0'), findsOneWidget);
  });

  testWidgets('«Clear» on a row empties that store only', (t) async {
    await pump(t, await overrides());
    await t.tap(find.byKey(const ValueKey('storage-messages')));
    await t.pumpAndSettle();
    expect(find.text('Clear the cache?'), findsOneWidget);
    expect(
      find.textContaining('Chat history on this phone'),
      findsOneWidget,
    );
    await t.tap(find.byKey(const ValueKey('storage-clear-confirm')));
    await t.pumpAndSettle();
    expect(await cache.messagesBytes(), 0);
    expect(await cache.httpBytes(), greaterThan(0));
    expect(find.text('2 KB used'), findsOneWidget);
  });

  testWidgets('«Clear cache» empties everything but keeps the outbox',
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
    await t.scrollUntilVisible(
      find.byKey(const ValueKey('storage-clear-all')),
      200,
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

  testWidgets('a limit can only be lowered under the admin ceiling', (t) async {
    await pump(
      t,
      await overrides(config: {'cache.limit_mb.images': '300'}),
    );
    final row = find.byKey(const ValueKey('storage-limit-images'));
    await t.scrollUntilVisible(row, 200);
    expect(
      find.descendant(of: row, matching: find.text('300 MB')),
      findsOneWidget,
    );
    await t.tap(row);
    await t.pumpAndSettle();
    expect(find.text('Maximum (300 MB)'), findsOneWidget);
    expect(find.text('500 MB'), findsNothing, reason: 'over the ceiling');
    await t.tap(find.byKey(const ValueKey('storage-limit-images-100')));
    await t.pumpAndSettle();
    expect(
      find.descendant(of: row, matching: find.text('100 MB')),
      findsOneWidget,
    );
  });

  testWidgets('«Keep chat media» offers 3 days / week / month / always',
      (t) async {
    // The administrator allows «always» (0); with a 30-day ceiling the
    // «Always» choice is not offered.
    await pump(
      t,
      await overrides(config: {'cache.keep_media_days.default': '0'}),
    );
    final row = find.byKey(const ValueKey('storage-keep-media'));
    await t.scrollUntilVisible(row, 200);
    expect(find.text('Always'), findsOneWidget);
    await t.tap(row);
    await t.pumpAndSettle();
    for (final k in KeepMedia.values) {
      expect(find.byKey(ValueKey('storage-keep-${k.name}')), findsOneWidget);
    }
    await t.tap(find.byKey(const ValueKey('storage-keep-threeDays')));
    await t.pumpAndSettle();
    expect(find.text('3 days'), findsOneWidget);
  });
}

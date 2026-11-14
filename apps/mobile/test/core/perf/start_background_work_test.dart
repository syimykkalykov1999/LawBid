import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/cache/memory_pressure.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/startup/startup_idle_queue.dart';
import 'package:lawbid/features/settings/storage/application/storage_providers.dart';

/// Perf batch 4 (row 127): the cache clean-up waits for the first screens;
/// the phone's memory warning frees the app's own memory copies.
class _Maintenance implements CacheMaintenance {
  int enforced = 0;

  @override
  Future<void> enforce() async => enforced++;

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}

class _Http extends HttpCacheInterceptor {
  final clears = <bool>[];

  @override
  Future<void> clear({bool disk = true}) async => clears.add(disk);
}

void main() {
  testWidgets('the first cache enforce runs after the start, not at it',
      (tester) async {
    final m = _Maintenance();
    final c = ProviderContainer(
      overrides: [cacheMaintenanceProvider.overrideWithValue(m)],
    )..read(cacheEnforcerProvider);
    expect(m.enforced, 0, reason: 'nothing during the splash');
    await tester.pump(
      StartupDelays.cacheEnforce - const Duration(seconds: 1),
    );
    expect(m.enforced, 0);
    await tester.pump(const Duration(seconds: 1));
    expect(m.enforced, 1);
    // The burst hook stays as it was.
    AppImageCaches.onWriteBurst?.call();
    expect(m.enforced, 2);
    c.dispose();
    expect(AppImageCaches.onWriteBurst, isNull);
  });

  test('the delays are named next to each other', () {
    expect(StartupDelays.caseFileCleanUp, const Duration(seconds: 20));
    expect(StartupDelays.cacheEnforce, const Duration(seconds: 30));
  });

  testWidgets('memory pressure drops the HTTP memory layer, not the disk',
      (tester) async {
    final http = _Http();
    final c = ProviderContainer(
      overrides: [httpCacheInterceptorProvider.overrideWithValue(http)],
    );
    addTearDown(c.dispose);
    c.read(memoryPressureProvider);
    final before = MemoryPressure.signal.value;
    tester.binding.handleMemoryPressure();
    expect(http.clears, [false]);
    expect(MemoryPressure.signal.value, before + 1);
    // Removed with the provider: no observer left behind.
    c.dispose();
    tester.binding.handleMemoryPressure();
    expect(http.clears, [false]);
  });
}

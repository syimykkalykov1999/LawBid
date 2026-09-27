import 'dart:async';

import 'package:dio/dio.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/connectivity/connectivity_service.dart';
import 'package:lawbid/core/connectivity/connectivity_status.dart';
import 'package:lawbid/core/connectivity/network_interface_monitor.dart';
import 'package:lawbid/core/connectivity/reachability.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/network/request_flags.dart';

/// Dependency-free reachability signal, fed by `ReachabilityInterceptor`
/// in `dioProvider`'s chain. Separate from [connectivityServiceProvider]
/// so building dio never builds the service (no provider cycle, and no
/// platform channel in tests that only use dio).
final reachabilitySignalProvider = Provider<ReachabilitySignal>((ref) {
  final signal = ReachabilitySignal();
  ref.onDispose(signal.dispose);
  return signal;
});

/// OS interface monitor (connectivity_plus). Override in tests.
final networkInterfaceMonitorProvider = Provider<NetworkInterfaceMonitor>(
  (ref) => ConnectivityPlusMonitor(),
);

/// `GET /health/live` (apps/api HealthController: public, outside the
/// `/api/v1` prefix, no version check). Any HTTP answer means the API is
/// reachable; only a transport failure counts as unreachable — the same
/// rule `ReachabilityInterceptor` applies to regular traffic, so the two
/// never disagree.
final reachabilityProbeProvider = Provider<ReachabilityProbe>((ref) {
  final dio = ref.watch(dioProvider);
  final healthUrl = Uri.parse(
    ref.watch(appEnvironmentProvider).apiBaseUrl,
  ).replace(path: '/health/live');
  return () async {
    try {
      await dio.getUri<Object?>(
        healthUrl,
        options: Options(
          extra: const {
            RequestFlags.skipAuth: true,
            RequestFlags.noRetry: true
          },
          sendTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
          validateStatus: (_) => true,
        ),
      );
      return true;
    } on DioException catch (e) {
      return e.response != null;
    }
  };
});

/// The app-wide [ConnectivityService], started on first read.
final connectivityServiceProvider = Provider<ConnectivityService>((ref) {
  final service = ConnectivityService(
    monitor: ref.watch(networkInterfaceMonitorProvider),
    reachability: ref.watch(reachabilitySignalProvider),
    probe: ref.watch(reachabilityProbeProvider),
  );
  ref.onDispose(service.dispose);
  unawaited(service.start());
  return service;
});

/// Current [ConnectivityStatus]; rebuilds only when it changes.
final connectivityStatusProvider =
    NotifierProvider<ConnectivityStatusNotifier, ConnectivityStatus>(
  ConnectivityStatusNotifier.new,
);

/// Exposes [ConnectivityService.changes] as Riverpod state and forwards
/// user-initiated re-checks.
class ConnectivityStatusNotifier extends Notifier<ConnectivityStatus> {
  @override
  ConnectivityStatus build() {
    final service = ref.watch(connectivityServiceProvider);
    final sub = service.changes.listen((status) => state = status);
    ref.onDispose(sub.cancel);
    return service.status;
  }

  /// Banner "Retry": probes right away. Returns true when back online.
  Future<bool> retry() => ref.read(connectivityServiceProvider).retryNow();
}

/// Convenience: true while offline for any reason.
final isOfflineProvider = Provider<bool>(
  (ref) => ref.watch(connectivityStatusProvider).isOffline,
);

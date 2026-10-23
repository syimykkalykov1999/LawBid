import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/realtime/realtime_timings.dart';

/// The server-tunable connection timings (`client.timings` in the
/// bootstrap's `app_config`), defaults while it sends none.
final realtimeTimingsProvider = Provider<RealtimeTimings>((ref) {
  final config = ref.watch(
    featureFlagsControllerProvider.select((s) => s.appConfig),
  );
  return RealtimeTimings.fromAppConfig(config);
});

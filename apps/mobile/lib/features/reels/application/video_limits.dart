import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';

/// The server's `video.reel_max_duration_sec` default; the live value comes
/// from the admin panel (bootstrap app_config).
const kDefaultReelSeconds = 180;

/// `video.post_max_duration_sec` default: a video post up to an hour.
const kDefaultPostVideoSeconds = 3600;

/// `video.max_source_duration_sec`: the longest video a reel is cut from.
const kDefaultReelSourceSeconds = 900;

int reelMaxSeconds(WidgetRef ref) =>
    reelMaxSecondsOf(ref.read(featureFlagsControllerProvider));

/// Owner 2026-10-23: `video.reel_max_duration_sec`, else the old single
/// `video.max_duration_sec` (an admin who saved only that one), else 180.
int reelMaxSecondsOf(FeatureFlagsState flags) => flags.configInt(
      'video.reel_max_duration_sec',
      flags.configInt('video.max_duration_sec', kDefaultReelSeconds),
    );

/// `video.post_max_duration_sec` (never below the reel limit).
int postVideoMaxSeconds(WidgetRef ref) {
  final flags = ref.read(featureFlagsControllerProvider);
  final reel = reelMaxSecondsOf(flags);
  final post = flags.configInt(
    'video.post_max_duration_sec',
    kDefaultPostVideoSeconds,
  );
  return post < reel ? reel : post;
}

int reelSourceSeconds(WidgetRef ref) => ref
    .read(featureFlagsControllerProvider)
    .configInt('video.max_source_duration_sec', kDefaultReelSourceSeconds)
    .clamp(reelMaxSeconds(ref), 3600);

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';

/// The server's `video.max_duration_sec` default; the live value comes
/// from the admin panel (bootstrap app_config).
const kDefaultReelSeconds = 180;

/// `video.max_source_duration_sec`: the longest video a reel is cut from.
const kDefaultReelSourceSeconds = 900;

int reelMaxSeconds(WidgetRef ref) => ref
    .read(featureFlagsControllerProvider)
    .configInt('video.max_duration_sec', kDefaultReelSeconds);

int reelSourceSeconds(WidgetRef ref) => ref
    .read(featureFlagsControllerProvider)
    .configInt('video.max_source_duration_sec', kDefaultReelSourceSeconds)
    .clamp(reelMaxSeconds(ref), 3600);

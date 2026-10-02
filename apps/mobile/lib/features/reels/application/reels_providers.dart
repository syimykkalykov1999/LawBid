import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';

final reelsRepositoryProvider = Provider<ReelsRepository>(
  (ref) => ReelsRepository(
    apiDio: ref.watch(dioProvider),
    storageDio: ref.watch(storageDioProvider),
  ),
);

/// Owner 2026-10-01: every reel entry point (the "+" option, the feed's
/// Reels button) stays hidden until the owner turns `video_posts` on and
/// saves the Bunny keys in Admin → Integrations — the server only reports
/// the flag as on when both are true.
final reelsEnabledProvider = Provider<bool>(
  (ref) => ref.watch(featureFlagsControllerProvider).isEnabled('video_posts'),
);

/// The reels' sound: one switch for every reel, like Instagram. Feed
/// previews always play muted.
class ReelsMuted extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
}

final reelsMutedProvider =
    NotifierProvider<ReelsMuted, bool>(ReelsMuted.new);

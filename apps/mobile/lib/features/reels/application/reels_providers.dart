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

/// The reels' sound: one switch for every video of the session, like
/// Instagram. Owner 2026-10-19: every published video (reels and the feed)
/// starts WITH sound; turn it off once and the next ones play muted, for
/// the rest of the session.
class ReelsMuted extends Notifier<bool> {
  @override
  bool build() => false;

  void toggle() => state = !state;
}

/// Owner 2026-10-15: how many reel players are open over a tab. The shell
/// lets the video run under its floating nav bar while one is (as on the
/// Reels tab), whatever tab the player was opened from.
final reelPlayersOpenProvider =
    NotifierProvider<ReelPlayersOpen, int>(ReelPlayersOpen.new);

class ReelPlayersOpen extends Notifier<int> {
  @override
  int build() => 0;

  void opened() {
    if (ref.mounted) state = state + 1;
  }

  void closed() {
    if (ref.mounted) state = state > 0 ? state - 1 : 0;
  }
}

final reelsMutedProvider = NotifierProvider<ReelsMuted, bool>(ReelsMuted.new);

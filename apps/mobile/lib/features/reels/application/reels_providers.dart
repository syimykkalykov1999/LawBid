import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/client_badge/application/client_badge_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/reels/data/reels_repository.dart';
import 'package:lawbid/shared/domain/user_role.dart';

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

/// Owner 2026-11-04 (R-381): «включить/выключить рилсы для клиентских
/// аккаунтов». True when reels are on but this client may not publish one
/// (`reels_client_publish` off): the reel entry points hide, viewing,
/// likes, comments and shares stay; photos and briefs as before.
/// Attorneys and assistants always publish. With reels off (`video_posts`)
/// this is false — nothing changes there.
final clientReelsBlockedProvider = Provider<bool>((ref) {
  if (!ref.watch(reelsEnabledProvider)) return false;
  if (ref.watch(currentUserRoleProvider) != UserRole.client) return false;
  switch (ref.watch(reelsClientModeProvider)) {
    case ReelsClientMode.off:
      return true;
    case ReelsClientMode.free:
      return false;
    case ReelsClientMode.badge:
      // Owner 2026-11-04 (R-398): only clients wearing the gold badge.
      return !(ref.watch(clientBadgeActiveProvider).value ?? false);
  }
});

/// Owner 2026-11-04 (R-398): the admin's ONE three-way choice for client
/// reels — Выключено / Бесплатно всем / Только с галочкой — spelled by two
/// flags (`reels_client_publish`, then `reels_client_publish_paid_only`).
enum ReelsClientMode { off, free, badge }

final reelsClientModeProvider = Provider<ReelsClientMode>((ref) {
  final flags = ref.watch(featureFlagsControllerProvider);
  if (!flags.isEnabled('reels_client_publish')) return ReelsClientMode.off;
  return flags.isEnabled('reels_client_publish_paid_only')
      ? ReelsClientMode.badge
      : ReelsClientMode.free;
});

/// Owner 2026-11-04 (R-398): «Только с галочкой» and this client has no
/// badge — the video stays in sight but locked: the gallery hint says
/// «видео по подписке», a picked or recorded video opens the «Видео — по
/// подписке» sheet that leads to the badge screen. False in every other
/// case (then [clientReelsBlockedProvider] alone decides).
final clientReelsPaywalledProvider = Provider<bool>(
  (ref) =>
      ref.watch(clientReelsBlockedProvider) &&
      ref.watch(reelsClientModeProvider) == ReelsClientMode.badge,
);

/// Owner 2026-11-04 (R-398): the badge screen lists «Публикация рилсов»
/// only while the badge is what lets a client publish them.
final clientBadgeIncludesReelsProvider = Provider<bool>(
  (ref) =>
      ref.watch(reelsEnabledProvider) &&
      ref.watch(reelsClientModeProvider) == ReelsClientMode.badge,
);

/// Owner 2026-11-04 05:15 (R-381): «Для клиентов вкладка рилсов в профиле
/// тоже убирается, когда выключу, и добавляется, когда включу». Whether a
/// CLIENT's profile (own or viewed by anyone) shows the «Рилсы» tab — by
/// the profile's role, not the viewer's. With reels off (`video_posts`)
/// nothing changes. R-398: «Только с галочкой» keeps the tab (badge
/// holders publish).
final clientProfileReelsTabProvider = Provider<bool>(
  (ref) =>
      !ref.watch(reelsEnabledProvider) ||
      ref.watch(reelsClientModeProvider) != ReelsClientMode.off,
);

/// Whether this person may publish a reel now: reels on and not a client
/// held back by `reels_client_publish` (R-381).
final canPublishReelsProvider = Provider<bool>(
  (ref) =>
      ref.watch(reelsEnabledProvider) && !ref.watch(clientReelsBlockedProvider),
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
